import { EventManager } from "@project-sunbird/ext-framework-server/managers/EventManager"



export const addContentListener = (pluginId) => {

    EventManager.subscribe(`${pluginId}::download:complete`, (data) => {
        // extract each file 
    })
}