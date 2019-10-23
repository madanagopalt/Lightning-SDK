const child_process = require("child_process");
const rollup = require('rollup');
const fs = require("fs");

const dir = __dirname + "/..";

const info = {};
getName()
    .then(() => ensureDir())
    .then(() => copySkeleton())
    .then(() => ensureSrcDirs())
    .then(() => copyMetadata())
    .then(() => copyUxFiles())
    .then(() => copyAppFiles())
    .then(() => createBootstrap())
    .then(() => bundleUx())
    .then(() => bundleApp())
    .then(() => console.log('Spark release created! ' + process.cwd() + "/dist/" + info.dest))
    .then(() => console.log('(Use npm i to install and npm start to run)'))
    .catch(err => {
        console.error(err);
        process.exit(-1)
    });

function getName() {
    return new Promise((resolve, reject) => {
        fs.readFile("./metadata.json", function(err, res) {
            if (err) {
                return reject(new Error("Metadata.json file can't be read: run this from a directory containing a metadata file."));
            }

            const contents = res.toString();
            info.data = JSON.parse(contents);

            if (!info.data.identifier) {
                return reject(new Error("Can't find identifier in metadata.json file"));
            }

            info.identifier = info.data.identifier;

            return resolve();
        });
    });
}


function ensureDir() {
    info.dest = "spark";
    return exec("rm -rf ./dist/" + info.dest).then(() => exec("mkdir -p ./dist"));
}

function copySkeleton() {
    return exec("cp -r " + dir + "/dist/spark ./dist/");
}

function copyMetadata() {
    return exec("cp -r ./metadata.json ./dist/" + info.dest);
}

function copyUxFiles() {
    return exec("cp -r " + dir + "/static-ux ./dist/" + info.dest);
}

function copyAppFiles() {
    if (fs.existsSync("./static")) {
        return exec("cp -r ./static ./dist/" + info.dest);
    } else {
        return Promise.resolve();
    }
}

function getFramework() {
    return [
        'const fetch = require("node-fetch");',
        'const Headers = fetch.Headers;',
        'const lng = require("./lightning-spark");',
        'const ux = require("./ux");'
    ].join("\n");
}

function getBootstrap() {
    return JSON.stringify({
        "frameworkType": "sparkGL",
        "frameworkURL": "./src/framework.js",
        "applicationURL": "./start.mjs"
    }, null, 2);
}

function createBootstrap() {
    fs.writeFileSync("./dist/" + info.dest + "/src/framework.js", getFramework());
    fs.writeFileSync("./dist/" + info.dest + "/start.spark", getBootstrap());
}

function bundleApp() {
    console.log("Generate rollup bundle for app (src/App.js)");
    return rollup.rollup({input: "./src/App.js"}).then(bundle => {
        return bundle.generate({format: 'esm'}).then(content => {
            const location = "./dist/" + info.dest + "/src/app.mjs";
            fs.writeFileSync(location, content.code);
        });
    });
}

function bundleUx() {
    console.log("Generate rollup bundle for ux");
    return rollup.rollup({input: dir + "/js/src/ux.js"}).then(bundle => {
        return bundle.generate({format: 'cjs'}).then(content => {
            const location = "./dist/" + info.dest + "/src/ux.js";
            fs.writeFileSync(location, content.code);
        });
    });
}

function ensureSrcDirs() {
    return Promise.all([
        exec("mkdir -p ./dist/" + info.dest + "/src"),
    ]);
}

function exec(command, opts) {
    return new Promise((resolve, reject) => {
        console.log("EXECUTE: " + command);
        child_process.exec(command, opts, function(err, stdout, stderr) {
            if (err) {
                return reject(err);
            }

            console.log(stdout);
            console.warn(stderr);
            resolve(stdout);
        });
    });
}