
async function fetchJSON(url) {
    const data = await fetch(url)
    const json = await data.json()
    return json
}

async function fetchData(url) {
    const data = await fetch(url)
    const text = await data.text()
    return text
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
            html += `<a class="marker-list-marker-clickable" href="#" onclick="gotoMarkerFromList('${btoa(escape(m.name))}');">${m.name}</a>`
            html += `</li>`
        }
        html += `</ul></li>`
    }
    html += `</ul></div>\n`
    return html
}

async function extractMarkerIcons(marker_data) {
    const avatar_size = 30
    async function fetchMarker(url) {
        const json = await fetchJSON(url)
        return { url: url, data: L.icon(json) }
    }
    async function fetchAvatar(url) {
        const uuid = url.match(/avatar:\/\/([0-9a-fA-F]{32})/)[1]
        return {
            url, data: L.icon({
                iconUrl: `https://minotar.net/helm/${uuid}/${avatar_size}`,
                iconSize: [avatar_size, avatar_size],
                iconAnchor: [avatar_size / 2, avatar_size / 2],
                popupAnchor: [0, -(avatar_size / 4)],
                tooltipAnchor: [0, -(avatar_size / 2)]
            })
        }
    }
    async function markerUrlDispatcher(url) {
        if (url.match(/https?:\/\//)) return fetchMarker(url)
        else if (url.match(/avatar:\/\//)) return fetchAvatar(url)
    }
    let icons = new Map()
    for (let cat in marker_data) {
        for (let m of marker_data[cat]['markers']) {
            if (m.icon) icons.set(m.icon, m.icon)
        }
        if (marker_data[cat].icon) icons.set(marker_data[cat].icon, marker_data[cat].icon)
    }
    let data_raw = await Promise.all([...icons.values()].map(url => markerUrlDispatcher(url)))
    for (let m of data_raw) {
        icons.set(m.url, m.data)
    }
    return icons
}

async function loadBaseMap(config, map, boundary) {
    // Init base maps
    let meta
    try {
        meta = await fetchJSON(`${config.tiles_server}/metadata.json`)
    } catch (e) {
        console.error(e)
        // something really bad is happening.
        meta = {}
    }
    let isWebpAvailable = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') == 0
    // let isSlowNetwork = false 
    // let isSuperSlowNetwork = false
    // if (navigator.connection) {
    //     if (navigator.connection.effectiveType != '4g') isSlowNetwork = true
    //     // if (navigator.connection.effectiveType == '2g' || navigator.connection.effectiveType == 'slow-2g') isSuperSlowNetwork = isSlowNetwork = true
    //     if (navigator.connection.saveData) isSuperSlowNetwork = isSlowNetwork = true
    //     if (navigator.connection.downlink && navigator.connection.downlink < 2) isSuperSlowNetwork = isSlowNetwork = true
    // }
    let base_maps = config.base_maps
    for (let m in base_maps) {
        base_maps[m] = new L.tileLayer(`${config.tiles_server}/z{z}/{style}/{x},{y}.{format}{cache_str}`, {
            style: base_maps[m],
            format: config.use_webp_tile && isWebpAvailable ? 'webp' : 'png', // config.use_webp_tile && isWebpAvailable && !isSuperSlowNetwork ? 'webp' : isSlowNetwork ? 'jpg' : 'png',
            maxZoom: config.max_zoom,
            minZoom: config.min_zoom,
            maxNativeZoom: config.max_tile_zoom,
            minNativeZoom: config.min_tile_zoom,
            attribution: config.attribution,
            tileSize: 512,
            bounds: boundary,
            cache_str: data => {
                let latest_timestamp = 0
                let one_side_tile_num = Math.pow(2, Math.abs(data.z - config.max_tile_zoom))
                for (let x = data.x * one_side_tile_num; x < (data.x + 1) * one_side_tile_num; x++) {
                    for (let y = data.y * one_side_tile_num; y < (data.y + 1) * one_side_tile_num; y++) {
                        if (`${data.style}/${x},${y}` in meta && latest_timestamp < meta['base'] - meta[`${data.style}/${x},${y}`]) {
                            latest_timestamp = meta['base'] - meta[`${data.style}/${x},${y}`]
                        }
                    }
                }
                return latest_timestamp > 0 ? `?t=${latest_timestamp}` : ''
            }
        })
        if (m == config.default_base_map) {
            base_maps[m].addTo(map)
        }
    }

    return base_maps
}

async function loadGeoJSON(config, map) {
    async function fetchGeoJSON({ name, url }) {
        let json = await fetchJSON(url)
        return { name, data: json }
    }
    // Fetch geojson if exist 
    let overlays = {}
    if (config.geojson) {
        let sources = []
        for (let gj of Object.keys(config.geojson)) {
            sources.push({ name: gj, url: config.geojson[gj].source })
        }
        let data_raw
        try {
            data_raw = await Promise.all(sources.map(fetchGeoJSON))
        } catch (e) {
            console.error(e)
            return {}
        }
        let sources_data = {}
        for (let i of data_raw) {
            sources_data[i.name] = i.data
        }

        for (let gj of Object.keys(config.geojson)) {
            let source = sources_data[gj]
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
        let raw_marker_data
        try {
            // Fetch markers
            raw_marker_data = await fetchJSON(`${config.marker_server}`) // Make sure we have cache-control: no-cache server side.
            // Marker Data: {what_category: {icon: '', markers: [{x, z, name, description}]}}
        } catch (e) {
            console.error(e)
            return {}
        }
        let icons_data
        try {
            icons_data = await extractMarkerIcons(raw_marker_data)
        } catch (e) {
            console.error(e)
            icons_data = {}
        }
        let markers_list = {}

        for (let cat in raw_marker_data) {
            let markers_group = L.layerGroup()
            for (let m of raw_marker_data[cat]['markers']) {
                markers_list[m.name] = L.marker([m.x + 0.5, m.z + 0.5], {  // Offset applied toward pixel center.
                    icon: icons_data.get(m.icon) || icons_data.get(raw_marker_data[cat]['icon']) || new L.Icon.Default,
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
            name = unescape(atob(name))
            let loc = markers_list[name].getLatLng()
            map.flyTo(loc, config.focus_in_zoom)
            markers_list[name].openPopup()
            if (slide_menu) slide_menu.close()
        }
        return overlays
    }
    return {}
}

async function loadPlugin(url, mapViewer) {
    try {
        const {init} = await import(url)
        await init(mapViewer)
        return true
    } catch (e) {
        console.error(`Failed to load plugin ${url}`)
        console.error(e)
        return false
    }
}

window.initMaps = async function () {
    window.mapViewer = {}
    let config
    try {
        config = window.mapViewer.config = await fetchJSON('./config.json')  // Make sure we have cache-control: no-cache server side.
    } catch (e) {
        console.error(e)
        document.getElementById('map').innerHTML = "地图配置文件加载失败，请检查控制台。"
        return
    }

    let boundary = L.latLngBounds(L.latLng(config.boundary[0][0], config.boundary[0][1]), L.latLng(config.boundary[1][0], config.boundary[1][1]))

    window.document.title = config.title

    // Init map
    let MinecraftCRS = L.extend({}, L.CRS.Simple, {
        projection: {
            project: latlng => L.point(latlng.lat, latlng.lng),
            unproject: point => L.latLng(point.x, point.y)
        },
        transformation: L.transformation(1 / Math.pow(2, config.max_tile_zoom), 0, 1 / Math.pow(2, config.max_tile_zoom), 0)
    })
    document.getElementById('map').innerHTML = ""
    let map = window.mapViewer.map = L.map('map', {
        center: config.center || [0, 0],
        zoom: config.default_zoom || 0,
        zoomSnap: config.zoom_snap || 0.25,
        zoomDelta: config.zoom_delta || 0.5,
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

    let drawnItems = L.featureGroup();
    map.addLayer(drawnItems);
    let shapeOptions = {
        color: '#ff4444',
        opacity: 0.7,
        fillOpacity: 0.3,
        weight: 5
    }
    let drawControl = new L.Control.Draw({
        edit: {
            featureGroup: drawnItems
        },
        draw: {
            polyline: {
                shapeOptions
            },
            polygon: {
                shapeOptions,
                showArea: true
            },
            rectangle: {
                shapeOptions
            },
            circle: {
                shapeOptions
            },
            circlemarker: false
        }
    });
    map.addControl(drawControl);

    let overlay_drawnItems = {
        "手绘标记": drawnItems
    }

    let overlays = Object.assign({}, overlay_geojson, overlay_markers, overlay_drawnItems)

    const saveDrawnItem = () => {
        let data = []

        drawnItems.eachLayer(layer => {
            let item = {}
            if (layer instanceof L.Circle) {
                item.type = 'circle'
                item.latLng = layer.getLatLng()
                item.radius = layer.getRadius()
                item.color = layer.options.color
            } else if (layer instanceof L.Polygon) {
                item.type = 'polygon'
                item.latLngs = layer.getLatLngs()
                item.color = layer.options.color
            } else if (layer instanceof L.Polyline) {
                item.type = 'polyline'
                item.latLngs = layer.getLatLngs()
                item.color = layer.options.color
            } else if (layer instanceof L.Marker) {
                item.type = 'marker'
                item.latLng = layer.getLatLng()
                item.color = layer.options.icon.options.color
            } else {
                console.warn('Unknown layer type when saving draw tools layer')
                return //.eachLayer 'continue'
            }
            data.push(item)
        })
        localStorage['drawn-layers'] = JSON.stringify(data)
        // console.log('draw-tools: saved to localStorage')
    }

    const loadDrawnItem = () => {
        try {
            let dataStr = localStorage['drawn-layers']
            if (dataStr === undefined) return

            let data = JSON.parse(dataStr)
            for (let item of data) {
                let layer = null
                let extraOpt = {}
                if (item.color) extraOpt.color = item.color

                switch (item.type) {
                    case 'polyline':
                        layer = L.polyline(item.latLngs, L.extend({}, extraOpt))
                        break
                    case 'polygon':
                        layer = L.polygon(item.latLngs, L.extend({}, extraOpt))
                        break
                    case 'circle':
                        layer = L.circle(item.latLng, item.radius, L.extend({}, extraOpt))
                        break
                    case 'marker':
                        layer = L.marker(item.latLng, L.extend({}, extraOpt))
                        break
                    default:
                        console.warn('unknown layer type "' + item.type + '" when loading draw tools layer')
                        break
                }
                if (layer) {
                    drawnItems.addLayer(layer)
                }
            }
        } catch (e) {
            console.warn('draw-tools: failed to load data from localStorage: ' + e)
        }
    }

    loadDrawnItem()

    map.on('draw:created', e => drawnItems.addLayer(e.layer))

    map.on('draw:created', saveDrawnItem)
    map.on('draw:edited', saveDrawnItem)
    map.on('draw:deleted', saveDrawnItem)

    // Init layers control
    const layerCtl = window.mapViewer.layerCtl = L.control.layers(base_maps, overlays)
    layerCtl.addTo(map)

    if (location.hash.match(/^#-{0,1}[0-9]+,-{0,1}[0-9]+,-{0,1}[0-9]+$/)) {
        let [lat, lng, zoom] = location.hash.slice(1).split(',')
        map.setView(L.latLng(lat, lng), parseInt(zoom) * config.zoom_snap)
        let popup = L.popup({ className: 'popup-coord-tip' }).setLatLng(L.latLng(lat, lng)).setContent(`<a href=${location.href}>(${lat},${lng})</a>`).openOn(map)
    } else if (this.location.hash.match(/^#-{0,1}[0-9]+,-{0,1}[0-9]+$/)) {
        let [lat, lng] = location.hash.slice(1).split(',')
        map.setView(L.latLng(lat, lng), config.focus_in_zoom)
        let popup = L.popup({ className: 'popup-coord-tip' }).setLatLng(L.latLng(lat, lng)).setContent(`<a href=${location.href}>(${lat},${lng})</a>`).openOn(map)
    }

    window.onhashchange = (ev) => {
        if (location.hash.match(/^#-{0,1}[0-9]+,-{0,1}[0-9]+,-{0,1}[0-9]+$/)) {
            let [lat, lng, zoom] = location.hash.slice(1).split(',')
            map.setView(L.latLng(lat, lng), parseInt(zoom) * config.zoom_snap)
            let popup = L.popup({ className: 'popup-coord-tip' }).setLatLng(L.latLng(lat, lng)).setContent(`<a href=${location.href}>(${lat},${lng})</a>`).openOn(map)
        } else if (this.location.hash.match(/^#-{0,1}[0-9]+,-{0,1}[0-9]+$/)) {
            let [lat, lng] = location.hash.slice(1).split(',')
            map.setView(L.latLng(lat, lng), config.focus_in_zoom)
            let popup = L.popup({ className: 'popup-coord-tip' }).setLatLng(L.latLng(lat, lng)).setContent(`<a href=${location.href}>(${lat},${lng})</a>`).openOn(map)
        }
    }

    map.on('click', function (e) {
        let { lat, lng } = e.latlng
        lat = Math.floor(lat)
        lng = Math.floor(lng)

        let zoom = map.getZoom() / config.zoom_snap
        let jumpuri = location.href.replace(/#.+/, '') + `#${lat},${lng},${zoom}`
        let popup = L.tooltip({ interactive: true, className: 'mouse-coord-tip' }).setLatLng(e.latlng).setContent(`<a href="${jumpuri}">(${lat},${lng})</a>`).addTo(map)
        /*if (history.pushState) {
            history.pushState(null, null, `#${lat},${lng},${zoom}`);
        }
        else {
            location.hash = `#${lat},${lng},${zoom}`;
        }*/
    })

    // Load plugins if exist
    if (config.plugins) {
        for (const url of config.plugins) {
            await loadPlugin(url, window.mapViewer)
        }
    }
}

window.initMaps()
