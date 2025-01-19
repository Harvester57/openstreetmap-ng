import { Tooltip } from "bootstrap"
import i18next from "i18next"
import { GeolocateControl, type Map as MaplibreMap } from "maplibre-gl"

export class CustomGeolocateControl extends GeolocateControl {
    public constructor() {
        super({
            positionOptions: {
                maximumAge: 300_000, // 5 minutes
                timeout: 30_000, // 30 seconds
            },
        })
    }

    public override onAdd(map: MaplibreMap): HTMLElement {
        const container = super.onAdd(map)
        const button = container.querySelector("button.maplibregl-ctrl-geolocate")
        const buttonText = i18next.t("javascripts.map.locate.title")
        button.ariaLabel = buttonText
        new Tooltip(button, {
            title: buttonText,
            placement: "left",
        })
        return container
    }
}
