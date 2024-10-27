import i18next from "i18next"
import * as L from "leaflet"
import { renderColorPreviews } from "../_color-preview"
import { configureStandardForm } from "../_standard-form"
import { getPageTitle } from "../_title"
import { focusMapObject } from "../leaflet/_focus-layer"
import { makeBoundsMinimumSize } from "../leaflet/_utils"
import { getBaseFetchController } from "./_base-fetch"

const elementsPerPage = 20
const paginationDistance = 2

/**
 * Create a new changeset controller
 * @param {L.Map} map Leaflet map
 * @returns {object} Controller
 */
export const getChangesetController = (map) => {
    let paramsId = null
    let paramsBounds = null

    // On map update, refocus the changeset
    const onMapZoomEnd = (e) => {
        focusMapObject(
            map,
            {
                type: "changeset",
                id: paramsId,
                bounds: paramsBounds.map((b) => makeBoundsMinimumSize(map, b)),
            },
            {
                // Fit the bounds only on the initial update
                fitBounds: !e,
            },
        )
    }

    const onLoaded = (sidebarContent) => {
        renderColorPreviews()

        // Get elements
        const sidebarTitleElement = sidebarContent.querySelector(".sidebar-title")
        const sidebarTitle = sidebarTitleElement.textContent
        const subscriptionForm = sidebarContent.querySelector("form.subscription-form")
        const commentForm = sidebarContent.querySelector("form.comment-form")
        const elementsSection = sidebarContent.querySelector(".elements")

        // Set page title
        document.title = getPageTitle(sidebarTitle)

        // Handle not found
        if (!sidebarTitleElement.dataset.params) return

        // Get params
        const params = JSON.parse(sidebarTitleElement.dataset.params)
        paramsId = params.id
        paramsBounds = params.bounds
        const elements = params.elements

        if (paramsBounds) {
            // Listen for events and run initial update
            map.addEventListener("zoomend", onMapZoomEnd)
            onMapZoomEnd()
        }

        renderElements(elementsSection, elements)

        // On success callback, reload the changeset
        const onFormSuccess = () => {
            base.unload()
            base.load({ id: paramsId })
        }

        // Listen for events
        if (subscriptionForm) configureStandardForm(subscriptionForm, onFormSuccess)
        if (commentForm) configureStandardForm(commentForm, onFormSuccess)
    }

    const base = getBaseFetchController(map, "changeset", onLoaded)
    const baseLoad = base.load
    const baseUnload = base.unload

    base.load = ({ id }) => {
        const url = `/api/partial/changeset/${id}`
        baseLoad({ url })
    }

    base.unload = () => {
        map.removeEventListener("zoomend", onMapZoomEnd)
        focusMapObject(map, null)
        baseUnload()
    }

    return base
}

/**
 * Render elements component
 * @param {HTMLElement} elementsSection Elements section
 * @param {object} elements Elements data
 * @returns {void}
 */
const renderElements = (elementsSection, elements) => {
    console.debug("renderElements")

    const groupTemplate = elementsSection.querySelector("template.group")
    const entryTemplate = elementsSection.querySelector("template.entry")
    const fragment = document.createDocumentFragment()

    for (const type of ["way", "relation", "node"]) {
        const elementsType = elements[type]
        if (elementsType.length) {
            fragment.appendChild(renderElementType(groupTemplate, entryTemplate, type, elementsType))
        }
    }

    if (fragment.children.length) {
        elementsSection.innerHTML = ""
        elementsSection.appendChild(fragment)
    } else {
        elementsSection.remove()
    }
}

/**
 * Render elements of a specific type
 * @param {HTMLTemplateElement} groupTemplate Group template
 * @param {HTMLTemplateElement} entryTemplate Entry template
 * @param {string} type Element type
 * @param {object[]} elements Elements data
 * @returns {DocumentFragment} Fragment
 */
const renderElementType = (groupTemplate, entryTemplate, type, elements) => {
    console.debug("renderElementType", type, elements)

    const groupFragment = groupTemplate.content.cloneNode(true)
    const titleElement = groupFragment.querySelector(".title")
    const tbody = groupFragment.querySelector("tbody")

    const elementsLength = elements.length
    const totalPages = Math.ceil(elementsLength / elementsPerPage)
    let currentPage = 1

    const updateTitle = () => {
        let count
        if (totalPages > 1) {
            const from = (currentPage - 1) * elementsPerPage + 1
            const to = Math.min(currentPage * elementsPerPage, elementsLength)
            count = i18next.t("pagination.range", { x: `${from}-${to}`, y: elementsLength })
        } else {
            count = elementsLength
        }

        // prefer static translation strings to ease automation
        let newTitle
        if (type === "node") {
            newTitle = i18next.t("browse.changeset.node", { count })
        } else if (type === "way") {
            newTitle = i18next.t("browse.changeset.way", { count })
        } else if (type === "relation") {
            newTitle = i18next.t("browse.changeset.relation", { count })
        }
        titleElement.textContent = newTitle
    }

    const updateTable = () => {
        const tbodyFragment = document.createDocumentFragment()

        const iStart = (currentPage - 1) * elementsPerPage
        const iEnd = Math.min(currentPage * elementsPerPage, elementsLength)
        for (let i = iStart; i < iEnd; i++) {
            const element = elements[i]

            const entryFragment = entryTemplate.content.cloneNode(true)
            const iconImg = entryFragment.querySelector("img")
            const linkLatest = entryFragment.querySelector("a.link-latest")
            const linkVersion = entryFragment.querySelector("a.link-version")

            if (element.icon) {
                iconImg.src = `/static/img/element/${element.icon}`
                iconImg.title = element.icon_title
            } else {
                iconImg.remove()
            }

            if (!element.visible) {
                linkLatest.parentElement.parentElement.classList.add("deleted")
            }

            if (element.name) {
                const bdi = document.createElement("bdi")
                bdi.textContent = element.name
                linkLatest.appendChild(bdi)
                const span = document.createElement("span")
                span.textContent = ` (${element.id})`
                linkLatest.appendChild(span)
            } else {
                linkLatest.textContent = element.id
            }
            linkLatest.href = `/${type}/${element.id}`

            linkVersion.textContent = `v${element.version}`
            linkVersion.href = `/${type}/${element.id}/history/${element.version}`

            tbodyFragment.appendChild(entryFragment)
        }

        tbody.innerHTML = ""
        tbody.appendChild(tbodyFragment)
    }

    if (totalPages > 1) {
        const paginationContainer = groupFragment.querySelector(".pagination")

        const updatePagination = () => {
            console.debug("updatePagination", currentPage)

            const paginationFragment = document.createDocumentFragment()

            for (let i = 1; i <= totalPages; i++) {
                const distance = Math.abs(i - currentPage)
                if (distance > paginationDistance && i !== 1 && i !== totalPages) {
                    if (i === 2 || i === totalPages - 1) {
                        const li = document.createElement("li")
                        li.classList.add("page-item", "disabled")
                        li.ariaDisabled = "true"
                        li.innerHTML = `<span class="page-link">...</span>`
                        paginationFragment.appendChild(li)
                    }
                    continue
                }

                const li = document.createElement("li")
                li.classList.add("page-item")

                const button = document.createElement("button")
                button.classList.add("page-link")
                button.textContent = i
                li.appendChild(button)

                if (i === currentPage) {
                    li.classList.add("active")
                    li.ariaCurrent = "page"
                } else {
                    button.addEventListener("click", () => {
                        currentPage = i
                        updateTitle()
                        updateTable()
                        updatePagination()
                    })
                }

                paginationFragment.appendChild(li)
            }

            paginationContainer.innerHTML = ""
            paginationContainer.appendChild(paginationFragment)
        }

        updatePagination()
    } else {
        groupFragment.querySelector("nav").remove()
    }

    // Initial update
    updateTitle()
    updateTable()

    return groupFragment
}
