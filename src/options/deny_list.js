class DenyList {
    static _URLs = {
        BLANK: "about:blank",
        CHROME_REMOTE_DESKTOP: "https://remotedesktop.google.com/",
        DEVTOOLS: "devtools://devtools/"
    };

    static _SEPARATOR = "\n";

    static defaults() {
        return Object.values(DenyList._URLs).join(DenyList._SEPARATOR);
    }

    static parse(denyListString) {
        console.log(`Updated deny list:\r\n${denyListString}`);
        return denyListString.split(DenyList._SEPARATOR).map(url => url.trim()).filter(url => url.length > 0);
    }
}