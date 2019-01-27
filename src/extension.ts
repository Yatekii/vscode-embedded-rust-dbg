/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { MockDebugSession } from './mockDebug';
import * as Net from 'net';
import { Dict } from './common';
import * as util from './util';
import { ChildProcess } from 'child_process';
import * as gdb from './gdb';

export let output = vscode.window.createOutputChannel('LLDB');

/*
 * Set the following compile time flag to true if the
 * debug adapter should run inside the extension host.
 * Please note: the test suite does not (yet) work in this mode.
 */
const EMBED_DEBUG_ADAPTER = true; //false;

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('extension.mock-debug.getProgramName', config => {
		return vscode.window.showInputBox({
			placeHolder: "Please enter the name of a markdown file in the workspace folder",
			value: "readme.md"
		});
	}));

	// register a configuration provider for 'mock' debug type
	const provider = new MockConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('mock', provider));

	if (EMBED_DEBUG_ADAPTER) {
		const factory = new MockDebugAdapterDescriptorFactory();
		context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('mock', factory));
		context.subscriptions.push(factory);
	}
}

export function deactivate() {
	// nothing to do
}


class MockConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): Promise<ProviderResult<DebugConfiguration>> {

		// // if launch.json is missing or empty
		// if (!config.type && !config.request && !config.name) {
		// 	const editor = vscode.window.activeTextEditor;
		// 	if (editor && editor.document.languageId === 'markdown') {
		// 		config.type = 'mock';
		// 		config.name = 'Launch';
		// 		config.request = 'launch';
		// 		config.program = '${file}';
		// 		config.stopOnEntry = true;
		// 	}
		// }

		if (!config.program) {
			return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
				return undefined;	// abort launch
			});
		}

		let [adapter, port] = await this.startDebugAdapter(folder, {});

		this['adapter'] = adapter

		return config;
	}

	async startDebugAdapter(
		folder: WorkspaceFolder | undefined,
		params: Dict<string>
	): Promise<[ChildProcess, number]> {
		let adapterProcess = await gdb.spawnDebugAdapter(
				'gdb-multiarch',
				[],
				{},
				vscode.workspace.rootPath!);
		util.logProcessOutput(adapterProcess, output);
		let port = await gdb.getDebugServerPort(adapterProcess);
		return [adapterProcess, port];
	}
}

class MockDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	private server?: Net.Server;

	createDebugAdapterDescriptor(session: vscode.DebugSession, executable: vscode.DebugAdapterExecutable | undefined): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {

		if (!this.server) {
			// start listening on a random port
			this.server = Net.createServer(socket => {
				const session = new MockDebugSession();
				session.setRunAsServer(true);
				session.start(<NodeJS.ReadableStream>socket, socket);
			}).listen(0);
		}

		// make VS Code connect to debug server
		return new vscode.DebugAdapterServer(this.server.address().port);
	}

	dispose() {
		if (this.server) {
			this.server.close();
		}
	}
}
