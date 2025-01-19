import { Tooltip } from "bootstrap"
import i18next from "i18next"
import { type Map as MaplibreMap, NavigationControl } from "maplibre-gl"

export class CustomZoomControl extends NavigationControl {
    public constructor() {
        super({ showCompass: false })
    }

    public override onAdd(map: MaplibreMap): HTMLElement {
        const container = super.onAdd(map)

        const zoomInButton = container.querySelector("button.maplibregl-ctrl-zoom-in")
        const zoomInText = i18next.t("javascripts.map.zoom.in")
        zoomInButton.ariaLabel = zoomInText
        new Tooltip(zoomInButton, {
            title: zoomInText,
            placement: "left",
        })

        const zoomOutButton = container.querySelector("button.maplibregl-ctrl-zoom-out")
        const zoomOutText = i18next.t("javascripts.map.zoom.out")
        zoomOutButton.ariaLabel = zoomOutText
        new Tooltip(zoomOutButton, {
            title: zoomOutText,
            placement: "left",
        })

        return container
    }
}
