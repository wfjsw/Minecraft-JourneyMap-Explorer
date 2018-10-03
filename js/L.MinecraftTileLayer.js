// This TileLayer load JourneyMap tiles as a tile source.

L.MinecraftTileLayer = L.TileLayer.extend({
    options: {
        type: 'png',
        style: 'day',
        maxNativeZoom: 0,
        minNativeZoom: 0
    },
    
    initialize: function (url, options) {
        if ((typeof url) === 'undefined') throw new Error('Url not set.');

        options = L.Util.setOptions(this, options);

        var path = `${options.style}/{x},{y}.${options.type}`;

        L.TileLayer.prototype.initialize.call(this, url + path, options);
    },

	_getZoomForUrl: function () {
        // JourneyMap tiles doesn't have different tiles for zooming.
        return 0;
    },

    // @method createTile(coords: Object, done?: Function): HTMLElement
	// Called only internally, overrides GridLayer's [`createTile()`](#gridlayer-createtile)
	// to return an `<img>` HTML element with the appropriate image URL given `coords`. The `done`
	// callback is called when the tile has been loaded.
	createTile: function (coords, done) {
        var tile = document.createElement('img');

        tile.addEventListener('load', this._tileOnLoad.bind(this, done, tile));
        tile.addEventListener('error', this._tileOnError.bind(this, done, tile));

        if (this.options.crossOrigin || this.options.crossOrigin === '') {
            tile.crossOrigin = this.options.crossOrigin === true ? '' : this.options.crossOrigin;
        }

		/*
		 Alt tag is set to empty string to keep screen readers from reading URL and for compliance reasons
		 http://www.w3.org/TR/WCAG20-TECHS/H67
		*/
        tile.alt = '';

		/*
		 Set role="presentation" to force screen readers to ignore this
		 https://www.w3.org/TR/wai-aria/roles#textalternativecomputation
		*/
        tile.setAttribute('role', 'presentation');

        tile.style.imageRendering = 'pixelated'; // Key change

        tile.src = this.getTileUrl(coords);

        return tile;
    },

    // @section Extension methods
    // @uninheritable
    // Layers extending `TileLayer` might reimplement the following method.
    // @method getTileUrl(coords: Object): String
    // Called only internally, returns the URL for a tile given its coordinates.
    // Classes extending `TileLayer` can override this function to provide custom tile URL naming schemes.
    getTileUrl: function (coords) {
        var data = {
            r: L.Browser.retina ? '@2x' : '',
            s: this._getSubdomain(coords),
            x: coords.x,
            y: coords.y,
            z: this._getZoomForUrl()
        };
        if (this._map && !this._map.options.crs.infinite) {
            var invertedY = this._globalTileRange.max.y - coords.y;
            data['y'] = invertedY;
        }

        return L.Util.template(this._url, L.Util.extend(data, this.options));
    }

})
