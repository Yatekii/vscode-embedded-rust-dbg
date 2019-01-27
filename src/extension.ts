/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken } from 'vscode';
import { EmbeddedDebugSession } from './session';
import * as Net from 'net';

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
	const provider = new ConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('mock', provider));

	if (EMBED_DEBUG_ADAPTER) {
		const factory = new DebugAdapterDescriptorFactory();
		context.subscriptions.push(vscode.debug.registerDebugAdapterDescriptorFactory('mock', factory));
		context.subscriptions.push(factory);
	}
}

export function deactivate() {
	// nothing to do
}


class ConfigurationProvider implements vscode.DebugConfigurationProvider {

	/**
	 * Massage a debug configuration just before a debug session is being launched,
	 * e.g. add all missing attributes to the debug configuration.
	 */
	async resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): Promise<ProviderResult<DebugConfiguration>> {
		if (!config.program) {
			return vscode.window.showInformationMessage("Cannot find a program to debug").then(_ => {
				return undefined;	// abort launch
			});
		}

		return config;
	}
}

class DebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {

	private server?: Net.Server;

	/**
	 * This function is called when a new session start was requested (Play button, F5).
	 * @param session_config A configuration object, which holds a lot of information about the session that is requested to be started.
	 * @param executable An optional executable that can be used instead of a session.
	 */
	createDebugAdapterDescriptor(session_config: vscode.DebugSession, executable?: vscode.DebugAdapterExecutable): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
		if (!this.server) {
			// start listening on a random port
			this.server = Net.createServer(socket => {
				const session = new EmbeddedDebugSession(session_config);
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
