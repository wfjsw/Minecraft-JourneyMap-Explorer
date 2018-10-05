
function fetchJSON(url) {
    return new Promise((rs, rj) => {
        let xmlhttp = new XMLHttpRequest();
        xmlhttp.open('GET', url, true);
        xmlhttp.onload = function () {
            try {
                rs(JSON.parse(this.responseText))
            } catch (e) {
                rj(e)
            }
        }
        xmlhttp.onerror = function (e) {
            rj(e)
        }
        xmlhttp.send();
        return xmlhttp
    })
}

function generateMarkerPopupHTML(coord, name, description = "") {
    let html = `<div class="map-marker-popup">\n`
    html += `<div class="map-marker-title"> <span style="font-weight: bold;">${name}</span></div>\n`
    if (description) html += `<div class="map-marker-description">${description}</div>`
    html += `<hr>`
    html += `<div class="map-marker-coords">坐标: ${coord.x}, ${coord.z}</div>`
    html += `</div>\n`
    return html
}

function generateMarkerListHTML(markers) {
    let html = `<div class="marker-list-container">\n`
    html += `<div class="marker-list-title">地标列表</div>\n`
    html += `<ul class="marker-list-category-list">`
    for (let c of Object.keys(markers)) {
        html += `<li class="marker-list-category">`
        html += `<div class="marker-list-category-title">${c}</div>`
        html += `<ul class="marker-list-marker-list">`
        for (let m of markers[c]['markers']) {
            html += `<li class="marker-list-marker">`
            html += `<a class="marker-list-marker-clickable" href="#" onclick="gotoMarkerFromList('${m.name}');">${m.name}</a>`
            html += `</li>`
        }
        html += `</ul></li>`
    }
    html += `</ul></div>\n`
    return html
}

async function loadBaseMap(config, map, boundary) {
    // Init base maps
    let meta = await fetchJSON(`${config.tiles_server}/metadata.json`)
    let base_maps = config.base_maps
    for (let m in base_maps) {
        base_maps[m] = new L.MinecraftTileLayer(config.tiles_server, {
            style: base_maps[m],
            maxZoom: config.max_zoom,
            minZoom: config.min_zoom,
            attribution: config.attribution,
            tileSize: 512,
            bounds: boundary,
            useWebpIfAvailable: config.use_webp_tile,
            meta
        })
        if (m == config.default_base_map) {
            base_maps[m].addTo(map)
        }
    }

    return base_maps
}

async function loadGeoJSON(config, map) {
    // Fetch geojson if exist 
    let overlays = {}
    if (config.geojson) {
        for (let gj of Object.keys(config.geojson)) {
            let source = await fetchJSON(config.geojson[gj].source)
            let options = {}
            options.coordsToLatLng = coords => L.latLng(coords[0], coords[1])
            if (config.geojson[gj].style) {
                options.style = feature => config.geojson[gj].style
            }
            if (config.geojson[gj].attribution) {
                options.attribution = config.geojson[gj].attribution
            }
            let layer = L.geoJSON(source, options)
            if (config.geojson[gj].added_by_default) {
                layer.addTo(map)
            }
            overlays[gj] = layer
        }
    }
    return overlays
}

async function loadMarkers(config, map) {
    if (config.marker_server) {
        let overlays = {}
        // Fetch markers
        let raw_marker_data = await fetchJSON(`${config.marker_server}`) // Make sure we have cache-control: no-cache server side.
        // Marker Data: {what_category: {icon: '', markers: [{x, z, name, description}]}}

        let markers_list = {}

        for (let cat in raw_marker_data) {
            let markers_group = L.layerGroup()
            for (let m of raw_marker_data[cat]['markers']) {
                markers_list[m.name] = L.marker([m.x, m.z], {
                    icon: raw_marker_data[cat]['icon'] || new L.Icon.Default,
                    title: m.name
                }).bindPopup(generateMarkerPopupHTML({ x: m.x, z: m.z }, m.name, m.description))
                markers_list[m.name].addTo(markers_group)
            }
            markers_group.addTo(map) // Add to map by default
            overlays[cat] = markers_group
        }

        // Init Marker List
        let slide_menu
        if (Object.keys(overlays).length >= 0) {
            slide_menu = L.control.slideMenu(generateMarkerListHTML(raw_marker_data), {
                position: 'bottomleft',
                menuposition: 'bottomleft',
                width: '75%',
                maxwidth: '250px',
                hint: '地标'
            }).addTo(map);
        }

        window.gotoMarkerFromList = function (name) {
            let loc = markers_list[name].getLatLng()
            map.flyTo(loc, 2)
            markers_list[name].openPopup()
            if (slide_menu) slide_menu.close()
        }
        return overlays
    }
    return {}
}

window.initMaps = async function () {
    let config = await fetchJSON('./config.json')  // Make sure we have cache-control: no-cache server side.
    let boundary = L.latLngBounds(L.latLng(config.boundary[0][0], config.boundary[0][1]), L.latLng(config.boundary[1][0], config.boundary[1][1]))

    window.document.title = config.title

    // Init map
    let MinecraftProjection = {
        project: function (latlng) {
            return new L.Point(latlng.lat, latlng.lng);
        },
        unproject: function (point) {
            return new L.LatLng(point.x, point.y);
        }
    }
    let MinecraftCRS = L.extend({}, L.CRS.Simple, {
        projection: MinecraftProjection,
        transformation: L.transformation(1, 0, 1, 0)
    })
    document.getElementById('map').innerHTML = ""
    let map = window.map = L.map('map', {
        center: [0, 0],
        zoom: 0,
        zoomSnap: 0.25,
        zoomDelta: 0.5,
        crs: MinecraftCRS,
        maxBounds: boundary
    })

    // Init coords viewer
    let coord_viewer = new L.Control.Coordinates({
        latitudeText: 'x',
        longitudeText: 'z',
        precision: 0,
        promptText: '请复制坐标'
    })
    coord_viewer.addTo(map)
    map.on('mousemove', function (e) {
        coord_viewer.setCoordinates(e);
    })

    let [base_maps, overlay_geojson, overlay_markers] = await Promise.all([loadBaseMap(config, map, boundary), loadGeoJSON(config, map), loadMarkers(config, map)])

    let overlays = Object.assign({}, overlay_geojson, overlay_markers)

    // Init layers control
    L.control.layers(base_maps, overlays).addTo(map)

    if (location.hash.match(/^#-{0,1}[0-9]+,-{0,1}[0-9]+,-{0,1}[0-9]+$/)) {
        let [lat, lng, zoom] = location.hash.slice(1).split(',')
        map.setView(L.latLng(lat, lng), parseInt(zoom) / 4)
        let popup = L.popup().setLatLng(L.latLng(lat, lng)).setContent(`<a href=${location.href}>(${lat},${lng})</a>`).openOn(map)
    } else if (this.location.hash.match(/^#-{0,1}[0-9]+,-{0,1}[0-9]+$/)) {
        let [lat, lng] = location.hash.slice(1).split(',')
        map.setView(L.latLng(lat, lng), 1)
        let popup = L.popup().setLatLng(L.latLng(lat, lng)).setContent(`<a href=${location.href}>(${lat},${lng})</a>`).openOn(map)
    }

    window.onhashchange = (ev) => {
        if (!location.hash.match(/^#-{0,1}[0-9]+,-{0,1}[0-9]+,-{0,1}[0-9]+$/)) return
        let [lat, lng, zoom] = location.hash.slice(1).split(',')
        map.flyTo(L.latLng(lat, lng), parseInt(zoom) / 4)
    }

    map.on('click', function (e) {
        let { lat, lng } = e.latlng
        lat = Math.floor(lat)
        lng = Math.floor(lng)

        let zoom = map.getZoom() * 4
        let jumpuri = location.href.replace(/#.+/, '') + `#${lat},${lng},${zoom}`
        let popup = L.popup().setLatLng(e.latlng).setContent(`<a href="${jumpuri}">(${lat},${lng})</a>`).openOn(map)
        if (history.pushState) {
            history.pushState(null, null, `#${lat},${lng},${zoom}`);
        }
        else {
            location.hash = `#${lat},${lng},${zoom}`;
        }
    })
}
