function isChromebook() {
    return new Promise(resolve => {
        chrome.runtime.getPlatformInfo(info => {
            resolve(info.os === "cros");
        });
    });
}

const Rotation = {
    CW:  1,
    CCW: -1
};
const Change = {
    INCREASE: 1,
    DECREASE: -1
};
const WindowState = {
    TILED: "tiled",
    FLOATING: "floating"
};


const WINTYPES = {"windowTypes": Object.values(chrome.windows.WindowType)};
const LAYOUTS = new Map([
    ["Tall", function(windowIndex, windowCount, mWindowCount, area, margin, splitPct) {
        let l_width  = mWindowCount < windowCount ? Math.round((area.width+margin) * splitPct) : area.width-margin;
        let r_width  = Math.round((area.width+margin) * (1-splitPct));
        let l_height = Math.round((area.height-margin) / (mWindowCount));
        let r_height = Math.round((area.height-margin) / (windowCount-mWindowCount));

        if (windowIndex < mWindowCount) {
            return {
                "top":    area.top + margin + (l_height * windowIndex),
                "left":   area.left + margin,
                "width":  l_width - 2*margin,
                "height": l_height - margin
            };
        } else {
            return {
                "top":    area.top + margin + (r_height * (windowIndex-mWindowCount)),
                "left":   area.left + l_width,
                "width":  r_width - 2*margin,
                "height": r_height - margin
            };
        }
    }],
    ["Wide", function(windowIndex, windowCount, mWindowCount, area, margin, splitPct) {
        let t_height = mWindowCount < windowCount ? Math.round((area.height+margin) * splitPct) : area.height-margin;
        let b_height = Math.round((area.height+margin) * (1-splitPct));
        let t_width  = Math.round((area.width-margin) / (mWindowCount));
        let b_width  = Math.round((area.width-margin) / (windowCount-mWindowCount));

        if (windowIndex < mWindowCount) {
            return {
                "top":    area.top + margin,
                "left":   area.left + margin + (t_width * windowIndex),
                "width":  t_width - margin,
                "height": t_height - 2*margin
            };
        } else {
            return {
                "top":    area.top + t_height,
                "left":   area.left + margin + (b_width * (windowIndex-mWindowCount)),
                "width":  b_width - margin,
                "height": b_height - 2*margin
            };
        }
    }],
    ["Columns", function(windowIndex, windowCount, mWindowCount, area, margin, splitPct) {
        let height = area.height-margin;
        let width = Math.round((area.width-margin) / windowCount);
        return {
            "top":    area.top + margin,
            "left":   area.left + margin + (width * windowIndex),
            "width":  width - 2*margin,
            "height": height - 2*margin
        };
    }],
]);


let allDisplays = new Array();
class Display {
    constructor(displayInfo) {
        this.id = displayInfo.id;
        this.area = displayInfo.workArea;
        this.window_ids = new Array();
        this.excluded_window_ids = new Array();
        this._layout = null;
        this._main_wins = null;
        this._split_pct = null;
    }
    init() {
        return new Promise(resolve => {
            getSettings({
                [`layout_${this.id}`]: null,
                [`main_wins_${this.id}`]: 1,
                [`split_pct_${this.id}`]: 0.5
            }).then(settings => {
                console.log("Loaded Settings", settings);
                this._layout = settings[`layout_${this.id}`];
                this._main_wins = settings[`main_wins_${this.id}`];
                this._split_pct = settings[`split_pct_${this.id}`];
            });
        });
    }

    get layout() {
        return this._layout;
    }
    set layout(n) {
        chrome.storage.local.set({[`layout_${this.id}`]: this._layout = n});
    }
    get main_wins() {
        return this._main_wins;
    }
    set main_wins(n) {
        chrome.storage.local.set({[`main_wins_${this.id}`]: this._main_wins = n});
    }
    get split_pct() {
        return this._split_pct;
    }
    set split_pct(n) {
        chrome.storage.local.set({[`split_pct_${this.id}`]: this._split_pct = n});
    }

    getWindowIds() {
        return new Promise((resolve, reject) => {
            chrome.windows.getAll(WINTYPES, wins => {
                let new_ids = wins.filter(
                    win => win.state == "normal" && !this.excluded_window_ids.includes(win.id)
                ).filter(win => this.isInArea(win)).map(win => win.id);

                this.window_ids = this.window_ids.filter(windowId => new_ids.includes(windowId));
                new_ids.forEach(windowId => {
                    if (!this.window_ids.includes(windowId)) {
                        this.window_ids.push(windowId);
                    }
                });

                resolve(this.window_ids);
            });
        });
    }

    isInArea(win) {
        // Check which display a window is on by each corner in turn
        return (
            ( // top left
                (win.left >= this.area.left && win.left < this.area.left+this.area.width) &&
                (win.top >= this.area.top && win.top < this.area.top+this.area.height)
            ) ||
            ( // top right
                (win.left+win.width >= this.area.left && win.left < this.area.left+this.area.width) &&
                (win.top >= this.area.top && win.top < this.area.top+this.area.height)
            ) ||
            ( // bottom left
                (win.left >= this.area.left && win.left < this.area.left+this.area.width) &&
                (win.top+win.height >= this.area.top && win.top < this.area.top+this.area.height)
            ) ||
            ( // bottom right
                (win.left+win.width >= this.area.left && win.left < this.area.left+this.area.width) &&
                (win.top+win.height >= this.area.top && win.top < this.area.top+this.area.height)
            )
        );
    }

    static findByWinId(windowId, all) {
        return new Promise(resolve => {
            chrome.windows.get(windowId, WINTYPES, win => {
                resolve(all.find(d => d.isInArea(win)));
            });
        });
    }
}

function debounce(callback, wait, context = this) {
    let timeout = null;
    let callbackArgs = null;

    const later = () => callback.apply(context, callbackArgs);

    return function() {
        callbackArgs = arguments;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    }
}


function getSettings(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, resolve);
    });
}

function getDisplays() {
    return new Promise((resolve, reject) => {
        allDisplays = new Array();
        chrome.system.display.getInfo(displayInfo => {
            console.log("Display Info", displayInfo);
            if (displayInfo.length == 0) reject("Zero displays");
            displayInfo.forEach(d => allDisplays.push(new Display(d)));
            Promise.all(allDisplays.map(d => d.init())).then(resolve);
        });
    });
}

function layoutWindow(display, windowIds, windowId, windowIndex, margin) {
    return new Promise(resolve => {
        console.log("layoutWindow", display.layout, windowIndex, windowIds.length, display.main_wins, display.area, margin, display.split_pct);
        chrome.windows.update(windowId, LAYOUTS.get(display.layout)(
            windowIndex, windowIds.length, display.main_wins,
            display.area, margin, display.split_pct
        ), win => resolve);
    });
}

function tileDisplayWindows(display, margin) {
    return new Promise(resolve => {
        if (!LAYOUTS.has(display.layout)) display.layout = LAYOUTS.keys().next().value;
        display.getWindowIds().then(windowIds => {
            Promise.all(
                windowIds.map((windowId, windowIndex) => layoutWindow(display, windowIds, windowId, windowIndex, margin))
            );
        }).then(resolve);
    });
}

function tileWindows() {
    return new Promise((resolve, reject) => {
        getSettings({"margin": 2}).then(settings => {
            let margin = parseInt(settings.margin);
            Promise.all(
                 allDisplays.map(display => { tileDisplayWindows(display, margin) })
            ).then(resolve);
        });
    });
}

function getFocused() {
    return new Promise(resolve => {
        chrome.windows.getLastFocused(WINTYPES, win => {
            Display.findByWinId(win.id, allDisplays).then(disp => {
                resolve({"win": win, "disp": disp})
            });
        });
    });
}

function changeSplit(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            tileWindows().then(resolve);
            if (n === Change.INCREASE && f.disp.split_pct > 0.1) f.disp.split_pct -= 0.05;
            if (n === Change.DECREASE && f.disp.split_pct < 0.9) f.disp.split_pct += 0.05;
        });
    });
}

function changeMainWins(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            if (n === Change.INCREASE && f.disp.main_wins < f.disp.window_ids.length) f.disp.main_wins++;
            if (n === Change.DECREASE && f.disp.main_wins > 1) f.disp.main_wins--;
            tileWindows().then(resolve);
        });
    });
}

function focusRotate(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            let windowIds = f.disp.window_ids;
            let i = windowIds.indexOf(f.win.id);
            i = (-1 == i) ? i = 0 : (i+n+windowIds.length) % windowIds.length;
            chrome.windows.update(windowIds[i], {"focused": true}, win => resolve);
        });
    });
}

function windowRotate(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            let windowIds = f.disp.window_ids;
            let i = windowIds.indexOf(f.win.id)
            let j = (-1 == i) ? i = 0 : (i+n+windowIds.length) % windowIds.length;
            windowIds[i] = windowIds[j];
            windowIds[j] = f.win.id;
            tileWindows().then(resolve);
        });
    });
}

function windowSwapMain(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            let windowIds = f.disp.window_ids;
            let i = windowIds.indexOf(f.win.id);
            if (i == -1) i = 1;
            windowIds[i] = windowIds[0];
            windowIds[0] = f.win.id;
            tileWindows().then(resolve);
        });
    });
}

function changeLayout(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            let keys = LAYOUTS.keys();
            for (var i of keys) {
                if (i == f.disp.layout) {
                    f.disp.layout = keys.next().value;
                    break;
                }
            }
            tileWindows().then(resolve);
        });
    });
}

function focusDisplay(index) {
    return new Promise(resolve => {
        if (index < allDisplays.length) {
            allDisplays[index].getWindowIds().then(windowIds => {
                chrome.windows.update(windowIds[0], {"focused": true}, win => resolve);
            })
        } else {
            resolve();
        }
    });
}

function moveToDisplay(index) {
    return new Promise(resolve => {
        if (index < allDisplays.length) {
            let a = allDisplays[index].area;
            getFocused().then(f => {
                chrome.windows.update(f.win.id, {"left": a.left, "top": a.top}, win => {
                    this.window_ids.unshift(f.win.id); // Make it the first in the list
                    tileWindows().then(resolve);
                })
            })
        } else {
            resolve();
        }
    });
}

function changeWindowState(state) {
    return new Promise(resolve => {
        getFocused().then(f => {
            let xWindowIds = f.disp.excluded_window_ids;

            if (state === WindowState.FLOATING && !xWindowIds.includes(f.win.id)) xWindowIds.push(f.win.id);
            if (state === WindowState.TILED && xWindowIds.includes(f.win.id)) xWindowIds.splice(xWindowIds.indexOf(f.win.id, 1));
            tileWindows().then(resolve);
        });
    });
}

// By default we set enabled true only for Chromebooks™, but this
// can be overridden in the settings.tileWindows
getSettings({"enabled": isChromebook()}).then(settings => {
    if (settings.enabled) {
        getDisplays().then(tileWindows, reason => console.error(reason));

        chrome.system.display.onDisplayChanged.addListener(debounce(() => {
            getDisplays().then(tileWindows, reason => console.error(reason));
        }, 250));

        chrome.windows.onCreated.addListener(tileWindows);
        chrome.windows.onRemoved.addListener(tileWindows);
        chrome.windows.onFocusChanged.addListener(tileWindows);

        chrome.commands.onCommand.addListener(function(command) {
            console.log(command);
            const commands = new Map([
                ["001-shrink-main-pane",            () => changeSplit(Change.INCREASE)    ],
                ["002-expand-main-pane",            () => changeSplit(Change.DECREASE)    ],
                ["010-focus-next-win-ccw",          () => focusRotate(Rotation.CCW)       ],
                ["011-focus-next-win-cw",           () => focusRotate(Rotation.CW)        ],
                ["020-focus-dsp-1",                 () => focusDisplay(0)                 ],
                ["021-focus-dsp-2",                 () => focusDisplay(1)                 ],
                ["022-focus-dsp-3",                 () => focusDisplay(2)                 ],
                ["100-move-focused-win-1-win-ccw",  () => windowRotate(Rotation.CCW)      ],
                ["101-move-focused-win-1-win-cw",   () => windowRotate(Rotation.CW)       ],
                ["110-move-focused-win-1-dsp-1",    () => moveToDisplay(0)                ],
                ["111-move-focused-win-1-dsp-2",    () => moveToDisplay(1)                ],
                ["112-move-focused-win-1-dsp-3",    () => moveToDisplay(2)                ],
                ["120-swap-focused-win-main",       () => windowSwapMain()                ],
                ["130-float-focused-win",           () => changeWindowState(WindowState.FLOATING) ],
                ["131-tile-focused-win",            () => changeWindowState(WindowState.TILED)    ],
                ["200-increase-main-wins",          () => changeMainWins(Change.INCREASE) ],
                ["201-decrease-main-wins",          () => changeMainWins(Change.DECREASE) ],
                ["300-next-layout",                 () => changeLayout(Change.INCREASE)   ],
                ["301-prev-layout",                 () => changeLayout(Change.DECREASE)   ],
                ["900-reevaluate-wins",             () => tileWindows()                   ]
            ]);
            if (commands.has(command)) commands.get(command)();
        })
    } else {
        console.warn("Tiling Window Manager for Chrome OS\u2122 is disabled (by default when not on a Chromebook\u2122). Not running.");
    }
})

// Events sent by options page
chrome.runtime.onMessage.addListener(debounce(request => {
    if (request.hasOwnProperty("retile")) {
        tileWindows().catch(reason => console.error(reason));
    }
    if (request.hasOwnProperty("enabled")) {
        window.location.reload(false);
    }
}, 250));
