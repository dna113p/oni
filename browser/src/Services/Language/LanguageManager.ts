/**
 * LanguageManager
 *
 * Service for integrating language services, like:
 *  - Language server protocol
 *  - Synchronizing language configuration
 *  - Handling custom syntax (TextMate themes)
*/

import * as Log from "./../../Log"
import { Event } from "./../../Event"
import { IDisposable } from "./../../IDisposable"

import { editorManager } from "./../EditorManager"

import { LanguageClient2 } from "./LanguageClient2"
import { ILanguageClientProcess } from "./LanguageClientProcess"

import * as Helpers from "./../../Plugins/Api/LanguageClient/LanguageClientHelpers"

export interface ILanguageServerNotificationResponse {
    language: string
    payload: any
}

export class LanguageManager {

    private _languageServerInfo: { [language: string]: LanguageClient2 } = {}

    private _notificationSubscriptions: { [notificationMessage: string]: Event<any> }  = {}

    constructor() {
        editorManager.allEditors.onBufferEnter.subscribe((bufferInfo: Oni.EditorBufferEventArgs) => {
            const { language, filePath } = bufferInfo

            console.log("Buffer enter: " + bufferInfo.filePath)
            return this.sendLanguageServerNotification(language, filePath, "textDocument/didOpen", Helpers.pathToTextDocumentIdentifierParms(filePath))
        })

        editorManager.allEditors.onBufferLeave.subscribe((bufferInfo: Oni.EditorBufferEventArgs) => {
            const { language, filePath } = bufferInfo
            console.log("Buffer leave: " + bufferInfo.filePath)
            return this.sendLanguageServerNotification(language, filePath, "textDocument/didClose", Helpers.pathToTextDocumentIdentifierParms(filePath))
        })

        this.subscribeToLanguageServerNotification("window/logMessage", (args) => {
            debugger
        })

        this.subscribeToLanguageServerNotification("telemetry/event", (args) => {
            debugger
        })
    }

    public sendLanguageServerNotification(language: string, filePath: string, protocolMessage: string, protocolPayload: any): void {
        const languageClient = this._getLanguageClient(language)

        if (languageClient) {
            languageClient.sendNotification(filePath, protocolMessage, protocolPayload)
        } else {
            // TODO
        }
    }

    public subscribeToLanguageServerNotification(protocolMessage: string, callback: (args: ILanguageServerNotificationResponse) => void): IDisposable {

        const currentSubscription = this._notificationSubscriptions[protocolMessage]

        if (!currentSubscription) {
            const evt = new Event<any>()
            this._notificationSubscriptions[protocolMessage] = evt

            const languageClients = Object.values(this._languageServerInfo)
            languageClients.forEach((ls) => {
                ls.subscribe(protocolMessage, evt)
            })

            return evt.subscribe((args) => callback(args))
        } else {
            return currentSubscription.subscribe((args) => callback(args))
        }
    }

    public registerLanguageClientFromProcess(language: string, languageProcess: ILanguageClientProcess): any {

        if (this._languageServerInfo[language]) {
            Log.error("Duplicate language server registered for: " + language)
            return
        }
        
        const languageClient = new LanguageClient2(language, languageProcess) 

        for (let notification in this._notificationSubscriptions) {
            languageClient.subscribe(notification, this._notificationSubscriptions[notification])
        }

        this._languageServerInfo[language]  = languageClient
    }

    private _getLanguageClient(language: string): LanguageClient2 {
        return this._languageServerInfo[language]
    }
}

export const languageManager = new LanguageManager()