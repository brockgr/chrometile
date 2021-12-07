function hideElement(id) {
    let $el = document.getElementById(id);
    if (!$el) console.error(`Can't find ${id}`);
    $el.style.display = "none";
}

function showElement(id) {
    let $el = document.getElementById(id);
    if (!$el) console.error(`Can't find ${id}`);
    $el.style.display = "block";
}

function isSetupEnabled(def) {
    let $enabled = document.getElementById("enabled")
    console.log($enabled);
    return new Promise((resolve, reject) => {
        chrome.storage.local.get({"enabled": def}, settings => {
            resolve($enabled.checked = settings.enabled);
        });
        $enabled.addEventListener("click", () => {
            console.log("click");
            chrome.storage.local.set({"enabled": $enabled.checked});
            chrome.runtime.sendMessage({"enabled": $enabled.checked});
            window.location.reload(false);
        });
    });
}

function loadSetupOptions() {
    let $margin = document.getElementById("margin");
    chrome.storage.local.get({"margin": 2}, settings => {
        $margin.value = settings.margin;
    });
    $margin.addEventListener("change", () => {
        chrome.storage.local.set({"margin": $margin.value});
        chrome.runtime.sendMessage({"retile": true});
    });

    let $tbody = document.getElementById("keys");
    chrome.commands.getAll(function(commands) {
        commands.forEach(command => {
            let $row = document.createElement("tr");
            
            let $scut = document.createElement("td");
            let commandString = command.shortcut ? command.shortcut.replaceAll(/([^+]+)/g, "<kbd>$&</kbd>").replaceAll("+", "") : null;
            $scut.innerHTML = commandString || "&lt;none&gt;";

            let $desc = document.createElement("td");
            $desc.innerText = command.description.replace(/ \(Recommended.+/, "");
            
            let $recom = document.createElement("td");
            $recom.innerHTML = command.description.replace(/.+?Recommended: (.+?)\)/, "$1").replaceAll(/([^+]+)/g, "<kbd>$&</kbd>").replaceAll("+", "");

            $row.appendChild($scut);
            $row.appendChild($desc);
            $row.appendChild($recom);

            $tbody.appendChild($row);
        });
        console.log(commands);
    });

    document.getElementById("configure").addEventListener("click", () => chrome.tabs.create({
        url: "chrome://extensions/configureCommands"
    }));
}

hideElement("options");

let isCrOS = isChromebook();

isCrOS ? hideElement("warning") : showElement("warning");

isSetupEnabled(isCrOS).then(enabled => {
    if (enabled) {
        loadSetupOptions();
        showElement("options");
    }
});
