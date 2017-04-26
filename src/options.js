function hide(id) {
    let $el = document.getElementById(id);
    if (!$el) console.error("Can't find "+id);
    $el.style.display = "none";
}

function show(id) {
    let $el = document.getElementById(id);
    if (!$el) console.error("Can't find "+id);
    $el.style.display = "block";
}

function setUpEnabled(def) {
    let $en = document.getElementById('enabled')
    console.log($en);
    return new Promise((resolve, reject) => {
        chrome.storage.local.get({"enabled": def}, settings => {
            resolve($en.checked = settings.enabled);
        });
        $en.addEventListener('click', ()=> {
            console.log("click");
            chrome.storage.local.set({"enabled": $en.checked});
            chrome.runtime.sendMessage({"enabled": $en.checked});
            window.location.reload(false);
        });
    });
}

function setUpOptions() {
    let $margin = document.getElementById('margin');
    chrome.storage.local.get({"margin": 2}, settings => {
        $margin.value = settings.margin;
    });
    $margin.addEventListener('change', ()=> {
        chrome.storage.local.set({"margin": $margin.value});
        chrome.runtime.sendMessage({"retile": true});
    });

    let $tbody = document.getElementById('keys');
    chrome.commands.getAll(function(commands) {
        commands.forEach(command => {
            let $row = document.createElement('tr');
    
            let $scut = document.createElement('td');
            $scut.innerText = command.shortcut || "<none>";
            $row.appendChild($scut);
    
            let $desc = document.createElement('td');
            $desc.innerText = command.description;
            $row.appendChild($desc);
    
            $tbody.appendChild($row);
        });
        console.log(commands)
    });

    document.getElementById('configure').addEventListener('click', ()=> chrome.tabs.create({
        url: "chrome://extensions/configureCommands"
    }));
}

hide("options")

let isCh = isChromeBook();

isCh ? hide("warning") : show("warning")

setUpEnabled(isCh).then(enabled => {
    if (enabled) {
        setUpOptions();
        show("options")
    }
});
