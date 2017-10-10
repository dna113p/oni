/**
 * LanguageClientProcess.ts
 *
 * Responsible for the lifecycle of the language server process, including:
 *  - Creating the language process
 *  - Restarting language process if working path / rootPath differ
 *  - Sending initialization
 *  - Managing the connection
 *  - Getting server capabilities
*/

import * as rpc from "vscode-jsonrpc"
import { ChildProcess } from "child_process"

import * as Log from "./../../Log"
import { IEvent, Event} from "./../../Event"

import { LanguageClientLogger } from "./../../Plugins/Api/LanguageClient/LanguageClientLogger"

import * as Helpers from "./../../Plugins/Api/LanguageClient/LanguageClientHelpers"

import * as Process from "./../../Plugins/Api/Process"

export interface ILanguageClientProcess {

    onConnectionChanged: IEvent<rpc.MessageConnection>

    ensureActive(fileName: string): Promise<rpc.MessageConnection>
}

export type PathResolver = (filePath: string) => Promise<string>

export interface ServerRunOptions {
    /**
     * Specify `command` to use a shell command to spawn a process
     */
    command?: string

    /**
     * Specify `module` to run a JavaScript module
     */
    module?: string

    /**
     * Arguments to pass to the language servicew
     */
    args?: string[]

    workingDirectory?: PathResolver
}

export interface InitializationOptions {
    rootPath: PathResolver
}

export class LanguageClientProcess {

    private _process: ChildProcess
    private _connection: rpc.MessageConnection
    private _onConnectionChangedEvent = new Event<rpc.MessageConnection>()

    private _lastWorkingDirectory: string = null
    private _lastRootPath: string = null
    private _serverCapabilities: any = { }

    // Notifies when the connection has changed (due to process restart)
    // This allows consumers to re-subscribe to events
    public get onConnectionChanged(): IEvent<rpc.MessageConnection> {
        return this._onConnectionChangedEvent
    }

    constructor(
        private _serverOptions: ServerRunOptions,
        private _initializationOptions: InitializationOptions) {
    }

    public async ensureActive(fileName: string): Promise<rpc.MessageConnection> {
        const workingDirectory = await this._serverOptions.workingDirectory(fileName)
        const rootPath = await this._initializationOptions.rootPath(fileName)

        const shouldRestartServer = workingDirectory !== this._lastWorkingDirectory
                || this._lastRootPath !== rootPath
                || !this._connection

        if (shouldRestartServer) {
            this._end()
            await this._start(workingDirectory, rootPath)
            return this._connection
        } else {
            return this._connection
        }
    }

    private async _start(workingDirectory: string, rootPath: string): Promise<void> {
        const args = this._serverOptions.args || []

        const options = {
            cwd: workingDirectory || process.cwd()
        }

        if (this._serverOptions.command) {
            Log.info(`[LanguageClientProcess]: Starting process via '${this._serverOptions.command}'`)
            this._process = Process.spawnProcess(this._serverOptions.command, args, options)
        } else if (this._serverOptions.module) {
            Log.info(`[LanguageClientProcess]: Starting process via node script '${this._serverOptions.module}'`)
            this._process = Process.spawnNodeScript(this._serverOptions.module, args, options)
        } else {
            throw new Error("A command or module must be specified to start the server")
        }

        if (!this._process || !this._process.pid) {
            throw new Error("Unable to start language server process")
        }

        Log.info(`[LanguageClientProcess]: Started process ${this._process.pid}`)

        this._process.stderr.on("data", (msg) => {
            Log.info(`[LANGUAGE CLIENT - STDERR]: ${msg}`)
            // this._statusBar.setStatus(LanguageClientState.Error)
        })

        this._connection = rpc.createMessageConnection(
            (new rpc.StreamMessageReader(this._process.stdout)) as any,
            (new rpc.StreamMessageWriter(this._process.stdin)) as any,
            new LanguageClientLogger())


        this._onConnectionChangedEvent.dispatch(this._connection)

        this._connection.listen()

        const oniLanguageClientParams: any = {
            clientName: "oni",
            rootPath: "C:/test/dotnet-core",
            capabilities: {},
        }

        return this._connection.sendRequest(Helpers.ProtocolConstants.Initialize, oniLanguageClientParams)
            .then((response: any) => {
                Log.info(`[LanguageClientManager]: Initialized`)
                if (response && response.capabilities) {
                    this._serverCapabilities = response.capabilities
                }
            }, (err) => {
                Log.error(err)
            })
    }

    private _end(): void {
        Log.info("[LanguageClientProcess] Ending language server session")

        if (this._connection) {
            this._connection.dispose()
            this._connection = null
        }

        if (this._process) {
            this._process.kill()
            this._process = null
        }
    }
}