function isChromebook() {
    return new Promise(resolve => {
        chrome.runtime.getPlatformInfo(info => {
            resolve(info.os === "cros");
        });
    });
}
