const WINTYPES = {"windowTypes": Object.values(chrome.windows.WindowType)};
const LAYOUTS = new Map([
    [ 'Tall', (wIndex,wCount,mwCount,area,margin,splitPct) => {
        let l_width = mwCount < wCount ? Math.round((area.width+margin) * splitPct) : area.width-margin;
        let r_width = Math.round((area.width+margin) * (1-splitPct));
        let l_height = Math.round((area.height-margin) / (mwCount));
        let r_height = Math.round((area.height-margin) / (wCount-mwCount));

        if (wIndex < mwCount) {
            return {
                "left":   area.left + margin,
                "top":    area.top + margin + (l_height * wIndex),
                "width":  l_width - 2*margin,
                "height": l_height - margin
            }
        } else {
            return {
                "left":   area.left + l_width,
                "top":    area.top + margin + (r_height * (wIndex-mwCount)),
                "width":  r_width - 2*margin,
                "height": r_height - margin
            }
        }
    }],
    [ 'Wide', (wIndex,wCount,mwCount,area,margin,splitPct) => {
        let t_height = mwCount < wCount ? Math.round((area.height+margin) * splitPct) : area.height-margin;
        let b_height = Math.round((area.height+margin) * (1-splitPct));
        let t_width = Math.round((area.width-margin) / (mwCount));
        let b_width = Math.round((area.width-margin) / (wCount-mwCount));

        if (wIndex < mwCount) {
            return {
                "top":    area.top + margin,
                "left":   area.left + margin + (t_width * wIndex),
                "width":  t_width - margin,
                "height": t_height - 2*margin
            }
        } else {
            return {
                "top":    area.top + t_height,
                "left":   area.left + margin + (b_width * (wIndex-mwCount)),
                "width":  b_width - margin,
                "height": b_height - 2*margin
            }
        }
    }],
    [ 'Columns', (wIndex,wCount,mwCount,area,margin,splitPct) => {
        let height = area.height-margin;
        let width = Math.round((area.width-margin) / wCount);
        return {
            "top":    area.top + margin,
            "left":   area.left + margin + (width * wIndex),
            "width":  width - 2*margin,
            "height": height - 2*margin
        }
    }]
])


let allDisplays = new Array();
class Display {
    constructor(displayInfo) {
        this.id = displayInfo.id;
        this.area = displayInfo.workArea;
        this.window_ids = new Array();
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
            })
        })
    }

    get layout() {
        return this._layout
    }
    set layout(n) {
        chrome.storage.local.set({[`layout_${this.id}`]: this._layout = n})
    }
    get main_wins() {
        return this._main_wins
    }
    set main_wins(n) {
        chrome.storage.local.set({[`main_wins_${this.id}`]: this._main_wins = n})
    }
    get split_pct() {
        return this._split_pct
    }
    set split_pct(n) {
        chrome.storage.local.set({[`split_pct_${this.id}`]: this._split_pct = n})
    }

    getWindowIds() {
        return new Promise((resolve, reject) => {
            chrome.windows.getAll(WINTYPES, wins => {
                let new_ids = wins.filter(
                    w => w.state != 'minimized' && w.state != 'fullscreen'
                ).filter(w => this.isInArea(w)).map(w => w.id);

                this.window_ids = this.window_ids.filter(wid => new_ids.includes(wid))
                new_ids.forEach(wid => { if (!this.window_ids.includes(wid)) this.window_ids.push(wid) })

                resolve(this.window_ids);
            })
        })
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
        )
    }

    static findByWinId(wid, all) {
        return new Promise(resolve => {
            chrome.windows.get(wid, WINTYPES, win => {
                resolve(all.find(d => d.isInArea(win)));
            })
        })
    }
}

function debounce(callback, wait, context = this) {
  let timeout = null 
  let callbackArgs = null
  
  const later = () => callback.apply(context, callbackArgs)
  
  return function() {
    callbackArgs = arguments
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
  }
}


function getSettings(keys) {
    return new Promise((resolve, reject) => {
        chrome.storage.local.get(keys, resolve);
    })
}

function getDisplays() {
    return new Promise((resolve, reject) => {
        allDisplays = new Array();
        chrome.system.display.getInfo(displayInfo => {
            console.log("Display Info", displayInfo);
            if (displayInfo.length == 0) reject("Zero displays")
            displayInfo.forEach(d => allDisplays.push(new Display(d)));
            Promise.all(allDisplays.map(d => d.init())).then(resolve);
        })
    })
}

function layoutWindow(display, wids, wid, wIndex, margin) {
    return new Promise(resolve => {
        console.log("layoutWindow",display.layout, wIndex,wids.length,display.main_wins,display.area,margin,display.split_pct);
        chrome.windows.update(wid, LAYOUTS.get(display.layout)(
            wIndex, wids.length, display.main_wins,
            display.area, margin, display.split_pct
        ), win => resolve);
    })
}

function tileDisplayWindows(display, margin) {
    return new Promise(resolve => {
        if (!LAYOUTS.has(display.layout)) display.layout = LAYOUTS.keys().next().value;
        display.getWindowIds().then(wids => {
            Promise.all(
                wids.map((wid, wIndex) => layoutWindow(display, wids, wid, wIndex, margin))
            )
        }).then(resolve)
    })
}

function tileWindows() {
    return new Promise((resolve, reject) => {
        getSettings({'margin': 2}).then(settings => {
            let margin = parseInt(settings.margin);
            Promise.all(
                 allDisplays.map(display => { tileDisplayWindows(display, margin) })
            ).then(resolve)
        })
    })
}

function getFocused() {
    return new Promise(resolve => {
        chrome.windows.getLastFocused(WINTYPES, win => {
            Display.findByWinId(win.id, allDisplays).then(disp=> {
                resolve({"win": win, "disp": disp})
            })
        })
    })
}

function changeSpilt(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            tileWindows().then(resolve);
            if (n > 0 && f.disp.split_pct > .1) f.disp.split_pct -= 0.05;
            if (n < 0 && f.disp.split_pct < .9) f.disp.split_pct += 0.05;
        })
    })
}

function changeMainWins(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            if (n > 0 && f.disp.main_wins < f.disp.window_ids.length) f.disp.main_wins++;
            if (n < 0 && f.disp.main_wins > 1) f.disp.main_wins--;
            tileWindows().then(resolve);
        })
    })
}

function focusRotate(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            let wids = f.disp.window_ids;
            let i = wids.indexOf(f.win.id)
            i = (-1==i) ? i = 0 : (i+n+wids.length) % wids.length;
            chrome.windows.update(wids[i], {"focused": true}, win => resolve);
        })
    })
}

function winRotate(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            let wids = f.disp.window_ids;
            let i = wids.indexOf(f.win.id)
            let j = (-1==i) ? i = 0 : (i+n+wids.length) % wids.length;
            wids[i] = wids[j]
            wids[j] = f.win.id
            tileWindows().then(resolve);
        })
    })
}

function winSwapMain(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            let wids = f.disp.window_ids;
            let i = wids.indexOf(f.win.id)
            if (i==-1) i = 1;
            wids[i] = wids[0]
            wids[0] = f.win.id
            tileWindows().then(resolve);
        })
    })
}

function chgLayout(n) {
    return new Promise(resolve => {
        getFocused().then(f => {
            let keys = LAYOUTS.keys();
            for (var i of keys) {
                if (i == f.disp.layout) {
                    f.disp.layout = keys.next().value
                    break;
                }
            }
            tileWindows().then(resolve);
        })
    })
}

function focusDisp(n) {
    return new Promise(resolve => {
        if (n < allDisplays.length) {
            allDisplays[n].getWindowIds().then(wids => {
                chrome.windows.update(wids[0], {"focused": true}, win => resolve);
            })
        } else {
            resolve();
        }
    })
}

function moveDisp(n) {
    return new Promise(resolve => {
        if (n < allDisplays.length) {
            let a = allDisplays[n].area();
            getFocused().then(f => {
                chrome.windows.update(f.win.id, {left: a.left, top: a.top}, win => {
                    this.window_ids.unshift(f.win.id); // Make it the first in the list
                    tileWindows().then(resolve);
                })
            })
        } else {
            resolve();
        }
    })
}

// By default we set enabled true only for Chromebooks™, but this
// can be overridden in the settings.tileWindows
getSettings({"enabled": isChromeBook()}).then(settings => {
    if (settings.enabled) {
        getDisplays().then(tileWindows, reason => console.error(reason));
    
        chrome.system.display.onDisplayChanged.addListener(() => {
            getDisplays().then(tileWindows, reason => console.error(reason));
        })
    
        chrome.windows.onCreated.addListener(tileWindows);
        chrome.windows.onRemoved.addListener(tileWindows);
        chrome.windows.onFocusChanged.addListener(tileWindows);
    
        chrome.commands.onCommand.addListener(function(command) {
            console.log(command);
            const commands = new Map([
                ['001-shrink-main-pane',            ()=> changeSpilt(1) ],
                ['002-expand-main-pane',            ()=> changeSpilt(-1)  ],
                ['010-focus-next-win-ccw',          ()=> focusRotate(-1) ],
                ['011-focus-next-win-cw',           ()=> focusRotate(1)  ],
                ['020-focus-dsp-1',                 ()=> focusDisp(0)  ],
                ['021-focus-dsp-2',                 ()=> focusDisp(1)  ],
                ['022-focus-dsp-3',                 ()=> focusDisp(2)  ],
                ['100-move-focused-win-1-win-ccw',  ()=> winRotate(-1) ],
                ['101-move-focused-win-1-win-cw',   ()=> winRotate(1) ],
                ['110-move-focused-win-1-dsp-1',    ()=> moveDisp(0) ],
                ['111-move-focused-win-1-dsp-2',    ()=> moveDisp(1) ],
                ['112-move-focused-win-1-dsp-3',    ()=> moveDisp(2) ],
                ['120-swap-focused-win-main',       ()=> winSwapMain() ],
                ['200-increase-main-wins',          ()=> changeMainWins(1) ],
                ['201-decrease-main-wins',          ()=> changeMainWins(-1) ],
                ['300-next-layout',                 ()=> chgLayout(1) ],
                ['301-prev-layout',                 ()=> chgLayout(-1) ],
                ['900-reevalulat-wins',             ()=> tileWindows() ]
            ]);
            if (commands.has(command)) commands.get(command)();
        })
    } else {
        console.warn("Tiling Window Manager for Chrome OS™ is disabled (by default when not on a Chromebook™). Not running.")
    }
})

// Events sent by options page
chrome.runtime.onMessage.addListener(debounce(request => {
    if (request.hasOwnProperty("retile")) {
        tileWindows().catch(reason => console.error(reason))
    }    
    if (request.hasOwnProperty("enabled")) {
        window.location.reload(false)
    }
}, 250));

