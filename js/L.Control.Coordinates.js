"use strict";

/**
 * author Michal Zimmermann <zimmicz@gmail.com>
 * Displays coordinates of mouseclick.
 * @param object options:
 *        position: bottomleft, bottomright etc. (just as you are used to it with Leaflet)
 *        latitudeText: description of latitude value (defaults to lat.)
 *        longitudeText: description of latitude value (defaults to lon.)
 *        promptText: text displayed when user clicks the control
 *        precision: number of decimals to be displayed
 */
L.Control.Coordinates = L.Control.extend({
	options: {
		position: 'bottomleft',
		latitudeText: 'lat.',
		longitudeText: 'lon.',
		promptText: 'Press Ctrl+C to copy coordinates',
		precision: 4,
		unitPerTileLine: 512,
		unitPerChunk: 16
	},

	initialize: function (options) {
		L.Control.prototype.initialize.call(this, options);
	},

	onAdd: function (map) {
		var className = 'leaflet-control-coordinates',
			that = this,
			container = this._container = L.DomUtil.create('div', className);

		that.options.unitPerTileLine = Object.values(map._layers).find(n => n instanceof L.TileLayer).options.tileSize
		that._offset = Object.values(map._layers).find(n => n instanceof L.TileLayer).options.offset
		
		map.on('baselayerchange', function (e) {
			that.options.unitPerTileLine = e.layer.options.tileSize
			that._offset = e.layer.options.offset
		});

		L.DomEvent.disableClickPropagation(container);

		this._addText(container, map);

		/*
		L.DomEvent.addListener(container, 'click', function () {
			var lat = L.DomUtil.get(that._lat),
				lng = L.DomUtil.get(that._lng),
				latTextLen = this.options.latitudeText.length + 1,
				lngTextLen = this.options.longitudeText.length + 1,
				latTextIndex = lat.textContent.indexOf(this.options.latitudeText) + latTextLen,
				lngTextIndex = lng.textContent.indexOf(this.options.longitudeText) + lngTextLen,
				latCoordinate = parseFloat(lat.textContent.substr(latTextIndex)),
				lngCoordinate = parseFloat(lng.textContent.substr(lngTextIndex));

			window.prompt(this.options.promptText, latCoordinate + ', ' + lngCoordinate);
		}, this);
		*/

		return container;
	},

	_addText: function (container, context) {
		this._lat = L.DomUtil.create('span', 'leaflet-control-coordinates-lat', container);
		this._lng = L.DomUtil.create('span', 'leaflet-control-coordinates-lng', container);
		this._tile = L.DomUtil.create('span', 'leaflet-control-coordinates-tile', container);
		this._chunk = L.DomUtil.create('span', 'leaflet-control-coordinates-chunk', container);

		return container;
	},

	/**
	 * This method should be called when user clicks the map.
	 * @param event object
	 */
	setCoordinates: function (obj) {
		if (obj.latlng) {
			L.DomUtil.get(this._lat).innerHTML = '<strong>' + this.options.latitudeText + ':</strong> ' + obj.latlng.lat.toFixed(this.options.precision).toString();
			L.DomUtil.get(this._lng).innerHTML = '<strong>' + this.options.longitudeText + ':</strong> ' + obj.latlng.lng.toFixed(this.options.precision).toString();
			L.DomUtil.get(this._tile).innerHTML = '<strong>tile: </strong> ' + Math.floor((obj.latlng.lat - this._offset[0]) / this.options.unitPerTileLine) + ',' + Math.floor((obj.latlng.lng - this._offset[1]) / this.options.unitPerTileLine);
			L.DomUtil.get(this._chunk).innerHTML = '<strong>chunk: </strong> ' + Math.floor(obj.latlng.lat / this.options.unitPerChunk) + ',' + Math.floor(obj.latlng.lng / this.options.unitPerChunk);
		}
	}
});
