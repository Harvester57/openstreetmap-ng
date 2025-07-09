import type { Map as MaplibreMap } from "maplibre-gl"
import { resolveDatetimeLazy } from "../lib/datetime"
import { requestAnimationFramePolyfill } from "../lib/utils"
import {
    configureActionSidebar,
    getActionSidebar,
    switchActionSidebar,
} from "./_action-sidebar"

let currentUrl: string | null = null
let sidebarScrollPosition = 0

export const getBaseFetchController = (
    map: MaplibreMap,
    className: string,
    loadCallback?: (sidebarContent: HTMLElement) => void | (() => void),
) => {
    const sidebar = getActionSidebar(className)
    const scrollSidebar = sidebar.closest(".sidebar") as HTMLElement
    const dynamicContent = sidebar.classList.contains("dynamic-content")
        ? sidebar
        : sidebar.querySelector("div.dynamic-content")
    const loadingHtml = dynamicContent.innerHTML

    let abortController: AbortController | null = null
    let loadCallbackDispose: void | (() => void)

    const onSidebarLoading = (): void => {
        // On sidebar loading, display loading content
        sidebarScrollPosition = scrollSidebar.scrollTop
        console.debug("Save sidebar scroll position", sidebarScrollPosition)
        dynamicContent.innerHTML = loadingHtml
    }

    const onSidebarLoaded = (html: string, newUrl: string): void => {
        // On sidebar loaded, display content and call callback
        dynamicContent.innerHTML = html
        resolveDatetimeLazy(dynamicContent)
        configureActionSidebar(sidebar)

        if (currentUrl === newUrl) {
            // If reload, restore sidebar scroll position
            const startTime = performance.now()
            const tryRestoreScroll = (): void => {
                if (scrollSidebar.scrollHeight > sidebarScrollPosition) {
                    scrollSidebar.scrollTop = sidebarScrollPosition
                    console.debug(
                        "Restore sidebar scroll position",
                        sidebarScrollPosition,
                    )
                    return
                }
                if (performance.now() - startTime < 2000) {
                    requestAnimationFramePolyfill(tryRestoreScroll)
                } else {
                    console.warn(
                        "Failed to restore sidebar scroll: content too small",
                        {
                            target: sidebarScrollPosition,
                            actual: scrollSidebar.scrollHeight,
                            newUrl,
                        },
                    )
                }
            }
            requestAnimationFramePolyfill(tryRestoreScroll)
        } else {
            currentUrl = newUrl
        }
    }

    return {
        load: (url?: string): void => {
            switchActionSidebar(map, sidebar)
            if (!url) {
                currentUrl = url
                return
            }

            if (abortController) {
                console.error(
                    "Base fetch controller",
                    className,
                    "wasn't properly unloaded",
                )
            }

            abortController = new AbortController()
            onSidebarLoading()

            fetch(url, {
                method: "GET",
                mode: "same-origin",
                cache: "no-store", // request params are too volatile to cache
                signal: abortController.signal,
                priority: "high",
            })
                .then(async (resp) => {
                    if (!resp.ok && resp.status !== 404)
                        throw new Error(`${resp.status} ${resp.statusText}`)
                    onSidebarLoaded(await resp.text(), url)
                    loadCallbackDispose = loadCallback?.(dynamicContent)
                })
                .catch((error) => {
                    if (error.name === "AbortError") return
                    console.error("Failed to fetch sidebar", error)
                    dynamicContent.textContent = error.message
                    alert(error.message)
                })
        },
        unload: () => {
            abortController?.abort()
            abortController = null
            if (typeof loadCallbackDispose === "function") {
                loadCallbackDispose()
                loadCallbackDispose = undefined
            }
        },
    }
}
