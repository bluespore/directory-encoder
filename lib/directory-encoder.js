/*global require:true*/
/*global module:true*/
(function(){
    "use strict";

    var fs = require( 'fs-extra' );
    var path = require( 'path' );
    var Handlebars = require( 'handlebars' );
    var SvgURIEncoder = require( './svg-uri-encoder' );
    var PngURIEncoder = require( './png-uri-encoder' );

    function DirectoryEncoder( input, output, optionsPng, optionsPngEncoded, tmp, generateClasses ){
        this.input = input;
        this.output = output;
        this.options = optionsPngEncoded || {};

        this.generateClasses = generateClasses;

        this.optionsPngEncoded = optionsPngEncoded;
        this.optionsPng = optionsPng;

        this.prefix = this.options.prefix || ".i--";

        this.options.pngfolder = this.options.pngfolder || "";
        this.options.pngpath = this.options.pngpath || this.options.pngfolder;

        this.tmp = tmp;

        this.customselectors = this.options.customselectors || {};

        /**
         * Turning off Template as output
         * is predefined for now
         */
        // this.template = this._loadTemplate( this.options.template );
        this.template = false;
    }

    DirectoryEncoder.encoders = {
        svg: SvgURIEncoder,
        png: PngURIEncoder
    };

    DirectoryEncoder.prototype.encode = function() {
        var
        self       = this,
        seen       = {},
        mixinStart = "@mixin grunticon($icon, $position: top left, $dimensions:false){\n\n";

        // remove the file if it's there
        if( fs.existsSync(this.output) ) {
            fs.unlinkSync( this.output );
        }

        if( !fs.existsSync(path.dirname( this.output )) ){
            fs.mkdirpSync( path.dirname( this.output ) );
        }

        /*
        Append each selector by reading through input directory
        and creating styles per file found there
         */
        fs.appendFileSync( self.output, mixinStart );
        fs.readdirSync( this.input ).forEach(function( file ) {

            var styles, datauri, stats,
                filepath = path.join( self.input, file ),
                extension = path.extname( file );

            if( extension === ".svg" || extension === ".png") {
                if( fs.lstatSync( filepath ).isFile() ) {
                    stats = self._stats( filepath );
                    datauri = self._datauri( filepath );

                    styles = self._styles( file.replace( extension, '' ), datauri, stats );

                    fs.appendFileSync( self.output, styles.mixinBody + "\n\n" );
                }
            }

        });
        fs.appendFileSync( self.output, "}" );

        /**
         * By default, in order to keep CSS filesize down,
         * we only generate classes if requested.
         */
        if(this.generateClasses){
            fs.readdirSync( this.input ).forEach(function( file ) {

                var styles, datauri, stats,
                    filepath = path.join( self.input, file ),
                    extension = path.extname( file );

                if( extension === ".svg"  || extension === ".png") {
                    if( fs.lstatSync( filepath ).isFile() ) {
                        self._checkName(seen, file.replace( extension, '' ));

                        stats = self._stats( filepath );
                        datauri = self._datauri( filepath );

                        styles = self._styles( file.replace( extension, '' ), datauri, stats );

                        fs.appendFileSync( self.output, styles.klass + "\n\n" );
                    }
                }

            });
        }
    };
    DirectoryEncoder.prototype._styles = function( name, datauri, stats ) {
        var self = this, width, height;

        if( stats ){
            width = stats.width;
            height = stats.height;
        }
        this.customselectors = this.customselectors || {};
        this.prefix = this.prefix || ".i--";

        if( this.customselectors[ "*" ] ){
            this.customselectors[ name ] = this.customselectors[ name ] || [];
            var selectors = this.customselectors[ "*" ];
            selectors.forEach( function( el ){
                var s = name.replace( new RegExp( "(" + name + ")" ), el );
                if( self.customselectors[ name ].indexOf( s ) === -1 ) {
                    self.customselectors[ name ].push( s );
                }
            });
        }

        var
        data = {
            prefix: this.prefix,
            name: name,
            datauri: datauri,
            width: width,
            height: height,
            customselectors: this.customselectors[ name ]
        },
        css = "",
        mixinBody = "";

        if( this.template ){
            css = this.template( data );
        } else {
            for( var i in data.customselectors ){
                if( data.customselectors.hasOwnProperty( i ) ){
                    css += data.customselectors[i] + ",\n";
                }
            }
            css += this.prefix + name + ":before{\n" +
                    "\tcontent:'';\n" +
                    "\tbackground-image: url('" + datauri.datasvg + "');\n" +
                    "\tbackground-repeat: no-repeat; \n" +
                    "\theight:" + stats.height + ";\n" +
                    "\twidth:" +  stats.width + ";\n\n" +
                    "\t.no-svg &{\n" +
                    "\t\tbackground-image: url('" + datauri.datapng + "');\n" +
                    "\t}\n\n" +
                    "\t.no-js &,\n\t.ie6 &,\n\t.ie7 &{\n" +
                    "\t\tbackground-image: url('" + datauri.png + "');\n" +
                    "\t}\n" +
                    "}";

            mixinBody += "\t@if $icon == \"" + name + "\" {\n\n" +
                         "\t\tbackground-image: url('" + datauri.datasvg + "');\n" +
                         "\t\tbackground-position: $position;\n\n" +
                         "\t\t.no-svg &{\n" +
                         "\t\t\tbackground-image: url('" + datauri.datapng + "');\n" +
                         "\t\t}\n\n" +
                         "\t\t.no-js &,\n\t\t.ie6 &,\n\t\t.ie7 &{\n" +
                         "\t\t\tbackground-image: url('" + datauri.png + "');\n" +
                         "\t\t}\n\n" +
                         "\t\t@if $dimensions{\n\n" +
                         "\t\t\theight:" + stats.height + ";\n" +
                         "\t\t\twidth:" +  stats.width + ";\n\n" +
                         "\t\t}" +
                         "\n\n\t}";

        }

        return {
            mixinBody: mixinBody,
            klass: css
        };
    };

    DirectoryEncoder.prototype._stats = function( file ){
        var encoder, extension = path.extname( file );

        if( typeof DirectoryEncoder.encoders[extension.replace(".", "")] === "undefined" ){
            throw new Error( "Encoder does not recognize file type: " + file );
        }

        encoder = new DirectoryEncoder.encoders[extension.replace(".", "")]( file );

        return encoder.stats();
    };

    DirectoryEncoder.prototype._datauri = function( file ) {
        var
        self       = this,
        filename   = file.split('/').slice(-1)[0].replace('png', 'svg'),
        filepath   = self.tmp + "/" + filename,
        pngEncoder = new DirectoryEncoder.encoders.png( file ),
        svgEncoder = new DirectoryEncoder.encoders.svg( self.tmp + "/" + filename );

        var output = {
            datapng: pngEncoder.encode ( self.optionsPngEncoded ),
            datasvg: svgEncoder.encode( self.optionsPngEncoded ),
            png: '/' + file
        }

        return output;
    };

    DirectoryEncoder.prototype._checkName = function( seen, name ) {
        if( seen[name] ){
            throw new Error("Two files with the same name: `" + name + "` exist in the input directory");
        }

        seen[name] = true;
    };

    DirectoryEncoder.prototype._loadTemplate = function( templateFile ) {
        var tmpl;


        if( templateFile && fs.existsSync( templateFile ) && fs.lstatSync( templateFile ).isFile() ){
            var source = fs.readFileSync( templateFile ).toString( 'utf-8' );
            tmpl = Handlebars.compile(source);
        } else {
            tmpl = false;
        }

        return tmpl;
    };

    module.exports = DirectoryEncoder;
}());
