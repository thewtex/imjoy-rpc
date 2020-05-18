(function($) {
  $.getStylesheet = function(href) {
    var $d = $.Deferred();
    var $link = $("<link/>", {
      rel: "stylesheet",
      type: "text/css",
      href: href
    }).appendTo("head");
    $d.resolve($link);
    return $d.promise();
  };
})(jQuery);


$.getStylesheet(
  "https://imjoy-team.github.io/vue-js-modal/styles.css"
);

function randId() {
  return Math.random()
    .toString(36)
    .substr(2, 10);
}


class MessageEmitter {
  constructor(debug) {
    this._event_handlers = {};
    this._once_handlers = {};
    this._debug = debug;
  }
  emit() {
    throw new Error("emit is not implemented");
  }
  on(event, handler) {
    if (!this._event_handlers[event]) {
      this._event_handlers[event] = [];
    }
    this._event_handlers[event].push(handler);
  }
  once(event, handler) {
    handler.___event_run_once = true;
    this.on(event, handler);
  }
  off(event, handler) {
    if (!event && !handler) {
      // remove all events handlers
      this._event_handlers = {};
    } else if (event && !handler) {
      // remove all hanlders for the event
      if (this._event_handlers[event]) this._event_handlers[event] = [];
    } else {
      // remove a specific handler
      if (this._event_handlers[event]) {
        const idx = this._event_handlers[event].indexOf(handler);
        if (idx >= 0) {
          this._event_handlers[event].splice(idx, 1);
        }
      }
    }
  }
  _fire(event, data) {
    if (this._event_handlers[event]) {
      var i = this._event_handlers[event].length;
      while (i--) {
        const handler = this._event_handlers[event][i];
        try {
          handler(data);
        } catch (e) {
          console.error(e);
        } finally {
          if (handler.___event_run_once) {
            this._event_handlers[event].splice(i, 1);
          }
        }
      }
    } else {
      if (this._debug) {
        console.warn("unhandled event", event, data);
      }
    }
  }
}

function init(config) {
  config = config || {};
  const targetOrigin = config.target_origin || "*";
  const peer_id = randId();
  const pluginConfig = {
    allow_execution: false,
    version: "0.1.0",
    api_version: "0.2.1",
    dedicated_thread: true,
    description: "Jupyter notebook",
    id: "jupyter_" + randId(),
    lang: "python",
    name: "Jupyter Notebook",
    type: "rpc-window",
    origin: window.location.origin,
    defaults: { fullscreen: true }
  };
  parent.postMessage(
    { type: "initialized", config: pluginConfig, peer_id: peer_id },
    targetOrigin
  );
}

const IMJOY_LOADER_URL = "http://127.0.0.1:8080/imjoy-loader.js";
require.config({
  baseUrl: "js",
  paths: {
    imjoyLoader: "https://lib.imjoy.io/imjoy-loader",
    vue: "https://cdn.jsdelivr.net/npm/vue@2.6.10/dist/vue.min",
    "vue-js-modal":
      "https://imjoy-team.github.io/vue-js-modal/index"
  },
  waitSeconds: 10 // optional
});

define([
  'base/js/namespace'
], function(
  Jupyter
) {
  function load_ipython_extension() {
    require(["imjoyLoader", "vue", "vue-js-modal"], function(
      imjoyLoder,
      Vue,
      vuejsmodal
    ) {
      //notebook view
      if (Jupyter.notebook) {
        Vue.use(vuejsmodal.default);
        var elem = document.createElement("div");
        elem.id = "app";
        elem.innerHTML = `
        <modal name="window-modal-dialog" :resizable="true" :draggable="true" :scrollable="true">
          <template v-for="wdialog in dialogWindows">
            <div
              :key="wdialog.id"
              v-if="wdialog === selected_dialog_window"
              :w="wdialog"
              :withDragHandle="true"
              style="height: 100%;"
            >
            <div :id="wdialog.iframe_container" style="width: 100%;height: 100%;"></div>
            </div>
          </template>
        </modal>
        `;
        document.body.appendChild(elem);
        var app = new Vue({
          el: "#app",
          data: {
            message: "Hello Vue!",
            dialogWindows: [],
            selected_dialog_window: null
          },
          methods: {
            show() {
              this.$modal.show("window-modal-dialog");
            },
            hide() {
              this.$modal.hide("window-modal-dialog");
            }
          }
        });

        function setupComm(targetOrigin) {
          console.log(Jupyter.notebook.kernel.comm_manager);
          const comm = Jupyter.notebook.kernel.comm_manager.new_comm("imjoy_rpc", {});
          comm.on_msg(msg => {
            const data = msg.content.data;
            const buffer_paths = data.__buffer_paths__ || [];
            delete data.__buffer_paths__;
            put_buffers(data, buffer_paths, msg.buffers || []);

            if (data.type === "log") {
              console.log(data.message);
            } else if (data.type === "error") {
              console.error(data.message);
            } else {
              parent.postMessage(data, targetOrigin);
            }
          });
          return comm;
        }

        function setupMessageHandler(targetOrigin, comm) {
          // event listener for the plugin message
          window.addEventListener("message", e => {
            if (targetOrigin === "*" || e.origin === targetOrigin) {
              const data = e.data;
              const split = remove_buffers(data);
              split.state.__buffer_paths__ = split.buffer_paths;
              comm.send(data, {}, {}, split.buffers);
            }
          });
        }

        var elem = document.createElement("div");
          elem.classList.add('btn-group')
          elem.innerHTML = `
          <button class="btn" onclick="reloadRPC()">Reload RPC</button>
          `;
          document.getElementById("maintoolbar-container").appendChild(elem);
          

        // check if it's inside an iframe
        if (window.self !== window.top) {
          init();
          console.log("ImJoy RPC started.");
          window.reloadRPC = function() {
            comm = setupComm("*");
            setupMessageHandler("*", comm);
            console.log("ImJoy RPC reloaded.");
          };
          // Jupyter.notebook.kernel.events.on("kernel_connected.Kernel", e => {
          //   init({
          //     register_comm: true,
          //     listen_events: false
          //   });
          //   console.log("ImJoy RPC reconnected.");
          // });
        } else {
          imjoyLoder.loadImJoyCore({base_url: 'http://127.0.0.1:8080/', debug: true}).then(imjoyCore => {
            const imjoy = new imjoyCore.ImJoy({
              imjoy_api: {
                async showDialog(_plugin, config) {
                  config.dialog = true;
                  
                  return await imjoy.pm.createWindow(_plugin, config)
                }
              }
            });
            window.reloadRPC = function() {
              imjoy.start().then(()=>{
                imjoy.event_bus.on("show_message", msg => {
                  console.log(msg);
                });
                imjoy.event_bus.on("add_window", async w => {
                  app.dialogWindows.push(w)
                  app.selected_dialog_window = w;
                  app.$modal.show("window-modal-dialog");
                  app.$forceUpdate()
                });
                class Connection extends MessageEmitter {
                  constructor(config){
                    super(config && config.debug);
                    const comm = Jupyter.notebook.kernel.comm_manager.new_comm("imjoy_rpc", {});
                    comm.on_msg(msg => {
                      const data = msg.content.data;
                      const buffer_paths = data.__buffer_paths__ || [];
                      delete data.__buffer_paths__;
                      put_buffers(data, buffer_paths, msg.buffers || []);
                      if (data.type === "log") {
                        console.log(data.message);
                      } else if (data.type === "error") {
                        console.error(data.message);
                      } else {
                        if(data.peer_id){
                          this._peer_id = data.peer_id
                        }
                        this._fire(data.type, data);
                      }
                    });
                    this.comm = comm;
                  }
                  connect() {
                  }
                  disconnect() {}
                  emit(data) {
                    data.peer_id = this._peer_id;
                    const split = remove_buffers(data);
                    split.state.__buffer_paths__ = split.buffer_paths;
                    this.comm.send(data, {}, {}, split.buffers);
                  }
                };
                imjoy.event_bus.on("add_window", w => {
                  w.api.show = w.show = () => {
                    app.selected_dialog_window = w;
                    app.$modal.show("window-modal-dialog");
                    imjoy.wm.selectWindow(w);
                    w.api.emit("show");
                  };
      
                  w.api.hide = w.hide = () => {
                    if (app.selected_dialog_window === w) {
                      app.$modal.hide("window-modal-dialog");
                    }
                    w.api.emit("hide");
                  };
      
                  setTimeout(() => {
                    try {
                      w.show();
                    } catch (e) {
                      console.error(e);
                    }
                  }, 500);
                });
                const connection = new Connection()
                imjoy.pm
                  .connectPlugin(connection)
                  .then(async plugin => {
                    let config = {};
                    if (plugin.config.ui && plugin.config.ui.indexOf("{") > -1) {
                      config = await imjoy.pm.imjoy_api.showDialog(
                        plugin,
                        plugin.config
                      );
                    }
                    await plugin.api.run({ config: config, data: {} });
                  })
                  .catch(e => {
                    console.error(e);
                    alert(`failed to load the plugin, error: ${e}`);
                  });
              })
            };
          });
        }
      }
    });

  }

  return {
    load_ipython_extension: load_ipython_extension
  };
});


// tree view
if (Jupyter.notebook_list) {
  // if inside an iframe, load imjoy-rpc
  if (window.self !== window.top) {
    loadImJoyRPC().then(imjoyRPC => {
      imjoyRPC.setupRPC({ name: "Jupyter Content" }).then(api => {
        function setup() {
          Jupyter._target = "self";
          api.log("ImJoy plugin initialized.");
        }

        function getSelections() {
          return Jupyter.notebook_list.selected;
        }
        api.export({
          setup,
          getSelections
        });
      });
    });
  } else {
    loadImJoyCore({
      debug: true,
      version: "latest"
    }).then(imjoyCore => {
      const imjoy = new imjoyCore.ImJoy({
        imjoy_api: {}
        //imjoy config
      });
      imjoy
        .start({
          workspace: "default"
        })
        .then(() => {
          console.log("ImJoy Core started successfully!");
        });
    });
  }
}


function isSerializable(object) {
  return typeof object === "object" && object && object.toJSON;
}

function isObject(value) {
  return value && typeof value === "object" && value.constructor === Object;
}

// pub_buffers and remove_buffers are taken from
// https://github.com/jupyter-widgets/ipywidgets/blob/master/packages/base/src/utils.ts
// Author: IPython Development Team
// License: BSD
function put_buffers(state, buffer_paths, buffers) {
  buffers = buffers.map(b => {
    if (b instanceof DataView) {
      return b;
    } else {
      return new DataView(b instanceof ArrayBuffer ? b : b.buffer);
    }
  });
  for (let i = 0; i < buffer_paths.length; i++) {
    const buffer_path = buffer_paths[i];
    // say we want to set state[x][y][z] = buffers[i]
    let obj = state;
    // we first get obj = state[x][y]
    for (let j = 0; j < buffer_path.length - 1; j++) {
      obj = obj[buffer_path[j]];
    }
    // and then set: obj[z] = buffers[i]
    obj[buffer_path[buffer_path.length - 1]] = buffers[i];
  }
}

/**
 * The inverse of put_buffers, return an objects with the new state where all buffers(ArrayBuffer)
 * are removed. If a buffer is a member of an object, that object is cloned, and the key removed. If a buffer
 * is an element of an array, that array is cloned, and the element is set to null.
 * See put_buffers for the meaning of buffer_paths
 * Returns an object with the new state (.state) an array with paths to the buffers (.buffer_paths),
 * and the buffers associated to those paths (.buffers).
 */
function remove_buffers(state) {
  const buffers = [];
  const buffer_paths = [];
  // if we need to remove an object from a list, we need to clone that list, otherwise we may modify
  // the internal state of the widget model
  // however, we do not want to clone everything, for performance
  function remove(obj, path) {
    if (isSerializable(obj)) {
      // We need to get the JSON form of the object before recursing.
      // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/stringify#toJSON()_behavior
      obj = obj.toJSON();
    }
    if (Array.isArray(obj)) {
      let is_cloned = false;
      for (let i = 0; i < obj.length; i++) {
        const value = obj[i];
        if (value) {
          if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
            if (!is_cloned) {
              obj = obj.slice();
              is_cloned = true;
            }
            buffers.push(ArrayBuffer.isView(value) ? value.buffer : value);
            buffer_paths.push(path.concat([i]));
            // easier to just keep the array, but clear the entry, otherwise we have to think
            // about array length, much easier this way
            obj[i] = null;
          } else {
            const new_value = remove(value, path.concat([i]));
            // only assigned when the value changes, we may serialize objects that don't support assignment
            if (new_value !== value) {
              if (!is_cloned) {
                obj = obj.slice();
                is_cloned = true;
              }
              obj[i] = new_value;
            }
          }
        }
      }
    } else if (isObject(obj)) {
      for (const key in obj) {
        let is_cloned = false;
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value = obj[key];
          if (value) {
            if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
              if (!is_cloned) {
                obj = {
                  ...obj
                };
                is_cloned = true;
              }
              buffers.push(ArrayBuffer.isView(value) ? value.buffer : value);
              buffer_paths.push(path.concat([key]));
              delete obj[key]; // for objects/dicts we just delete them
            } else {
              const new_value = remove(value, path.concat([key]));
              // only assigned when the value changes, we may serialize objects that don't support assignment
              if (new_value !== value) {
                if (!is_cloned) {
                  obj = {
                    ...obj
                  };
                  is_cloned = true;
                }
                obj[key] = new_value;
              }
            }
          }
        }
      }
    }
    return obj;
  }
  const new_state = remove(state, []);
  return {
    state: new_state,
    buffers: buffers,
    buffer_paths: buffer_paths
  };
}
