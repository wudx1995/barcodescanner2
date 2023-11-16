(function() {
    let _shadowRoot;
    let tmpl = document.createElement("template");
    tmpl.innerHTML = `
      <style>
        canvas.drawingBuffer {
            z-index : 11;
            position: absolute;
            width   : 100%;
            height  : 100%;
            top     : 50px;
            bottom  : 0;
            left    : 50px;
            right   : 0
        }   
      </style>
      <div id="export_div" name="export_div">
         <slot name="export_button"></slot>
      </div>
    `;

    class BarcodeScanner extends HTMLElement {

        constructor() {
            super();

            _shadowRoot = this.attachShadow({
                mode: "open"
            });
            _shadowRoot.appendChild(tmpl.content.cloneNode(true));

            this._id = createGuid();

            _shadowRoot.querySelector("#export_div").id = this._id + "_export_div";

            this._firstConnection = 0;
        }

        connectedCallback() {
            try {
                if (window.commonApp) {
                    let outlineContainer = commonApp.getShell().findElements(true, ele => ele.hasStyleClass && ele.hasStyleClass("sapAppBuildingOutline"))[0]; // sId: "__container0"

                    if (outlineContainer && outlineContainer.getReactProps) {
                        let parseReactState = state => {
                            let components = {};

                            let globalState = state.globalState;
                            let instances = globalState.instances;
                            let app = instances.app["[{\"app\":\"MAIN_APPLICATION\"}]"];
                            let names = app.names;

                            for (let key in names) {
                                let name = names[key];

                                let obj = JSON.parse(key).pop();
                                let type = Object.keys(obj)[0];
                                let id = obj[type];

                                components[id] = {
                                    type: type,
                                    name: name
                                };
                            }

                            for (let componentId in components) {
                                let component = components[componentId];
                            }

                            let metadata = JSON.stringify({
                                components: components,
                                vars: app.globalVars
                            });

                            if (metadata != this.metadata) {
                                this.metadata = metadata;

                                this.dispatchEvent(new CustomEvent("propertiesChanged", {
                                    detail: {
                                        properties: {
                                            metadata: metadata
                                        }
                                    }
                                }));
                            }                            
                        };

                        let subscribeReactStore = store => {
                            this._subscription = store.subscribe({
                                effect: state => {
                                    parseReactState(state);
                                    return {
                                        result: 1
                                    };
                                }
                            });
                        };

                        let props = outlineContainer.getReactProps();
                        if (props) {
                            subscribeReactStore(props.store);
                        } else {
                            let oldRenderReactComponent = outlineContainer.renderReactComponent;
                            outlineContainer.renderReactComponent = e => {
                                let props = outlineContainer.getReactProps();
                                subscribeReactStore(props.store);

                                oldRenderReactComponent.call(outlineContainer, e);
                            }
                        }                        
                    }
                }
            } catch (e) {}
        }

        disconnectedCallback() {
            if (this._subscription) { // react store subscription
                this._subscription();
                this._subscription = null;
            }
        }

        onCustomWidgetBeforeUpdate(changedProperties) {
            if ("designMode" in changedProperties) {
                this._designMode = changedProperties["designMode"];
            }
        }

        onCustomWidgetAfterUpdate(changedProperties) {
            var that = this;
            if (this._firstConnection === 0) {
                this._firstConnection = 1;
                let quaggaminjs = "https://wudx1995.github.io/barcodescanner2/quagga.min.js";
                async function LoadLibs() {
                    try {
                        await loadScript(quaggaminjs, _shadowRoot);
                    } catch (e) {
                        alert(e);
                    } finally {
                        loadthis(that);
                    }
                }
                LoadLibs();
            }
        }

        _renderExportButton() {
            let components = this.metadata ? JSON.parse(this.metadata)["components"] : {};
            console.log("_renderExportButton-components");
            console.log(components);
            console.log("end");
        }
    }
    customElements.define("com-fd-djaja-sap-sac-scanner", BarcodeScanner);

    // FUNCTIONS
    function loadthis(that) {
        var that_ = that;

        let buttonSlot = document.createElement('div');
        buttonSlot.slot = "export_button";
        that_.appendChild(buttonSlot);

        that_._Label = new sap.m.Label({
            required: false,
            text: "Barcode value",
            design: "Bold"
        });

        that_._exportButton = new sap.m.Button({
            id: "scan",
            text: "Scan",
            icon: "sap-icon://bar-code",
            visible: true,
            tooltip: "Scan Barcode",
            press: function() {
                startScan();
            }
        });

        that_._Input = new sap.m.Input({
            id: "scannedValue",
            type: sap.m.InputType.Text,
            placeholder: ''
        });

        that_._simpleForm = new sap.ui.layout.form.SimpleForm({
            labelSpanL: 3,
            labelSpanM: 3,
            emptySpanL: 3,
            emptySpanM: 3,
            columnsL: 1,
            columnsM: 1,
            editable: true,
            content: [
                that_._Label,
                that_._Input,
                that_._exportButton
            ]
        })

        that_._simpleForm.placeAt(buttonSlot);
        that_._renderExportButton();

        if (that_._designMode) {
            sap.ui.getCore().byId("scan").setEnabled(false);
            sap.ui.getCore().byId("scannedValue").setEditable(false);
        }
    }

    function _initQuagga(oTarget, that) {
        var oDeferred = jQuery.Deferred();

        // Initialise Quagga plugin - see https://serratus.github.io/quaggaJS/#configobject for details
        Quagga.init({
            inputStream: {
                type: "LiveStream",
                target: oTarget,
                constraints: {
                    width: {
                        min: 640
                    },
                    height: {
                        min: 480
                    },
                    facingMode: "environment"
                }
            },
            locator: {
                patchSize: "medium",
                halfSample: true
            },
            numOfWorkers: 2,
            frequency: 10,
            decoder: {
                readers: [{
                    format: "code_128_reader",
                    config: {}
                }]
            },
            locate: true
        }, function(error) {
            if (error) {
                oDeferred.reject(error);
            } else {
                oDeferred.resolve();
            }
        });

        if (!this._bQuaggaEventHandlersAttached) {
            // Attach event handlers...

            Quagga.onProcessed(function(result) {
                var drawingCtx = Quagga.canvas.ctx.overlay,
                    drawingCanvas = Quagga.canvas.dom.overlay;

                if (result) {
                    // The following will attempt to draw boxes around detected barcodes
                    if (result.boxes) {
                        drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
                        result.boxes.filter(function(box) {
                            return box !== result.box;
                        }).forEach(function(box) {
                            Quagga.ImageDebug.drawPath(box, {
                                x: 0,
                                y: 1
                            }, drawingCtx, {
                                color: "green",
                                lineWidth: 2
                            });
                        });
                    }

                    if (result.box) {
                        Quagga.ImageDebug.drawPath(result.box, {
                            x: 0,
                            y: 1
                        }, drawingCtx, {
                            color: "#00F",
                            lineWidth: 2
                        });
                    }

                    if (result.codeResult && result.codeResult.code) {
                        Quagga.ImageDebug.drawPath(result.line, {
                            x: 'x',
                            y: 'y'
                        }, drawingCtx, {
                            color: 'red',
                            lineWidth: 3
                        });
                    }
                }
            }.bind(this));

            Quagga.onDetected(function(result) {
                // Barcode has been detected, value will be in result.codeResult.code. If requierd, validations can be done 
                // on result.codeResult.code to ensure the correct format/type of barcode value has been picked up

                // Set barcode value in input field
                sap.ui.getCore().byId("scannedValue").setValue(result.codeResult.code);
                // Close dialog
                that._oScanDialog.close();
            }.bind(this));

            // Set flag so that event handlers are only attached once...
            this._bQuaggaEventHandlersAttached = true;
        }

        return oDeferred.promise();
    }

    function startScan() {
        if (!this._oScanDialog) {
            this._oScanDialog = new sap.m.Dialog({
                title: "Scan Barcode",
                contentWidth: "670px",
                contentHeight: "480px",
                horizontalScrolling: false,
                verticalScrolling: false,
                stretchOnPhone: true,
                content: [new sap.ui.core.HTML({
                    id: "scanContainer",
                    content: "<div />"
                })],
                endButton: new sap.m.Button({
                    text: "Cancel",
                    press: function(oEvent) {
                        this._oScanDialog.close();
                    }.bind(this)
                }),
                afterOpen: function() {
                    // TODO: Investigate why Quagga.init needs to be called every time...possibly because DOM 
                    // element is destroyed each time dialog is closed
                    _initQuagga(sap.ui.getCore().byId("scanContainer").getDomRef(), this).done(function() {
                        // Initialisation done, start Quagga
                        Quagga.start();
                    }).fail(function(oError) {
                        // Failed to initialise, show message and close dialog...this should not happen as we have
                        // already checked for camera device ni /model/models.js and hidden the scan button if none detected
                        MessageBox.error(oError.message.length ? oError.message : ("Failed to initialise Quagga with reason code " + oError.name), {
                            onClose: function() {
                                this._oScanDialog.close();
                            }.bind(this)
                        });
                    }.bind(this));

                }.bind(this),
                afterClose: function() {
                    // Dialog closed, stop Quagga
                    Quagga.stop();
                }
            });
        }

        this._oScanDialog.open();
    }

    function createGuid() {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
            let r = Math.random() * 16 | 0,
                v = c === "x" ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function loadScript(src, shadowRoot) {
        return new Promise(function(resolve, reject) {
            let script = document.createElement('script');
            script.src = src;

            script.onload = () => {
                console.log("Load: " + src);
                resolve(script);
            }
            script.onerror = () => reject(new Error(`Script load error for ${src}`));

            shadowRoot.appendChild(script)
        });
    }    
})();
