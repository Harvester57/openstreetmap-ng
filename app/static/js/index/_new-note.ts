import * as L from "leaflet"
import { qsParse } from "../_qs"
import { configureStandardForm } from "../_standard-form"
import { getPageTitle } from "../_title"
import { isLatitude, isLongitude } from "../_utils"
import { focusMapObject, focusStyles } from "../leaflet/_focus-layer"
import { getOverlayLayerById } from "../leaflet/_layers"
import { getMapState, setMapState } from "../leaflet/_map-utils"
import { setNewNoteButtonState } from "../leaflet/_new-note-control"
import { getActionSidebar, switchActionSidebar } from "./_action-sidebar"
import { routerNavigateStrict } from "./_router"

/**
 * Create a new new note controller
 * @param {L.Map} map Leaflet map
 * @returns {object} Controller
 */
export const getNewNoteController = (map) => {
    const sidebar = getActionSidebar("new-note")
    const sidebarTitle = sidebar.querySelector(".sidebar-title").textContent
    const form = sidebar.querySelector("form")
    const lonInput = form.elements.lon
    const latInput = form.elements.lat
    const commentInput = form.elements.text
    const submitButton = form.querySelector("[type=submit]")

    let halo = null
    let marker = null

    // On marker drag start, remove the halo
    const onMarkerDragStart = () => {
        halo.setStyle({
            opacity: 0,
            fillOpacity: 0,
        })
    }

    // On marker drag end, update the form's coordinates and add the halo
    const onMarkerDragEnd = () => {
        const latLng = marker.getLatLng()
        halo.setLatLng(latLng)
        halo.setStyle({
            opacity: focusStyles.noteHalo.opacity,
            fillOpacity: focusStyles.noteHalo.fillOpacity,
        })
    }

    // On success callback, navigate to the new note and simulate map move (reload notes layer)
    const onFormSuccess = ({ note_id }) => {
        map.panTo(map.getCenter(), { animate: false })
        routerNavigateStrict(`/note/${note_id}`)
    }

    // On client validation, update the form's coordinates
    const onClientValidation = () => {
        const latLng = marker.getLatLng()
        lonInput.value = latLng.lng
        latInput.value = latLng.lat
    }

    // On comment input, update the button state
    const onCommentInput = () => {
        const hasValue = commentInput.value.trim().length > 0
        submitButton.disabled = !hasValue
    }

    configureStandardForm(form, onFormSuccess, onClientValidation)

    return {
        load: () => {
            form.reset()
            switchActionSidebar(map, "new-note")
            document.title = getPageTitle(sidebarTitle)

            let center = map.getCenter()

            // Allow default location setting via URL search parameters
            const searchParams = qsParse(location.search.substring(1))
            if (searchParams.lon && searchParams.lat) {
                const lon = Number.parseFloat(searchParams.lon)
                const lat = Number.parseFloat(searchParams.lat)
                if (isLongitude(lon) && isLatitude(lat)) {
                    center = L.latLng(lat, lon)
                }
            }

            if (halo) console.warn("Halo already exists")

            halo = focusMapObject(map, {
                type: "note",
                id: null,
                lon: center.lng,
                lat: center.lat,
                icon: "new",
                draggable: true,
            })[0]

            // Listen for events
            marker = halo.marker
            marker.addEventListener("dragstart", onMarkerDragStart)
            marker.addEventListener("dragend", onMarkerDragEnd)

            // Enable notes layer to prevent duplicates
            const state = getMapState(map)
            const notesLayerCode = getOverlayLayerById("notes").options.layerCode
            if (!state.layersCode.includes(notesLayerCode)) {
                state.layersCode += notesLayerCode
                setMapState(map, state)
            }

            // Listen for events
            commentInput.addEventListener("input", onCommentInput)

            // Initial update
            onCommentInput()
            setNewNoteButtonState(true)
        },
        unload: () => {
            setNewNoteButtonState(false)
            commentInput.removeEventListener("input", onCommentInput)
            focusMapObject(map, null)
            halo = null
            marker = null
        },
    }
}
