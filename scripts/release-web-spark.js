const child_process = require("child_process");
const rollup = require('rollup');
const fs = require("fs");
const crypto = require('crypto');
const babel = require("@babel/core");
const babelPresetEnv = require("@babel/preset-env");
const resolve = require('rollup-plugin-node-resolve');
const commonjs = require('rollup-plugin-commonjs');

const dir = __dirname + "/..";

const info = {};
getName()
    .then(() => ensureDir())
    .then(() => copySkeleton())
    .then(() => ensureSrcDirs())
    .then(() => copyLightning())
    .then(() => copyThunder())
    .then(() => copyFetch())
    .then(() => copyMetadata())
    .then(() => copyUxFiles())
    .then(() => copyAppFiles())
    .then(() => bundleUx())
    .then(() => bundleApp())
    .then(() => createBootstrap())
    .then(() => babelify())
    .then(() => console.log('Web release created! ' + process.cwd() + "/dist/" + info.dest))
    .then(() => console.log('(Use a static web server to host it)'))
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
    info.dest = "web-spark";
    return exec("rm -rf ./dist/" + info.dest).then(() => exec("mkdir -p ./dist"));
}

function copySkeleton() {
    return exec("cp -r " + dir + "/dist/web ./dist/" + info.dest)
        .then(() => exec("cp -r " + dir + "/dist/web-spark ./dist/"));
}

function copyMetadata() {
    return exec("cp -r ./metadata.json ./dist/" + info.dest);
}

function copyUxFiles() {
    return exec("cp -r " + dir + "/static-ux ./dist/" + info.dest);
}

function copyLightning() {
    const dir = `./dist/${info.dest}/tmp`;
    return exec(`mkdir -p ${dir}`)
        .then(() => fs.writeFileSync(`${dir}/package.json`, JSON.stringify({
            "name": "tmp",
            "version": "0.0.1",
            "dependencies": {
                "wpe-lightning": "git+https://github.com/pxscene/Lightning.git#spark"
            }
        })))
        .then(() => exec(`npm --prefix ${dir} install ${dir}`))
        .then(() => rollup.rollup({
            input: `${dir}/node_modules/wpe-lightning/src/lightning.mjs`
        }))
        .then(bundle => bundle.generate({
            format: 'umd',
            name: "lng"
        }))
        .then(content => fs.writeFileSync(`./dist/${info.dest}/js/src/lightning-web.js`, content.code))
        .then(() => exec(`rm -rf ${dir}`))
        .then(() => exec(`mkdir -p ${dir}`))
        .then(() => exec(`mkdir -p ./dist/${info.dest}/js/spark`))
        .then(() => fs.writeFileSync(`${dir}/package.json`, JSON.stringify({
            "name": "tmp",
            "version": "0.0.1",
            "dependencies": {
                "wpe-lightning-spark": "https://github.com/madanagopalt/Lightning-Spark.git",
                "rollup-plugin-node-resolve": "^5.0.0"
            }
        })))
        .then(() => exec(`npm --prefix ${dir} install ${dir}`))
        .then(() => rollup.rollup({
            input: `${dir}/node_modules/wpe-lightning-spark/src/platforms/spark/SparkPlatform.mjs`
        }))
        .then(bundle => bundle.generate({
            format: 'umd',
            name: 'SparkPlatform',
            interop: false
        }))
        .then(content => content.code.replace(/var lng = .+\n/,"")) // TODO: how to do this normally
        .then(content => fs.writeFileSync(`./dist/${info.dest}/js/spark/SparkPlatform.js`, content))
        .finally(() => exec(`rm -rf ${dir}`));
}

function copyThunder() {
    const dir = `./dist/${info.dest}/tmp`;
    return exec(`mkdir -p ${dir}`)
        .then(() => fs.writeFileSync(`${dir}/package.json`, JSON.stringify({
            "name": "tmp",
            "version": "0.0.1",
            "dependencies": {
                "ThunderJS": "github:rdkcentral/ThunderJS"
            }
        })))
        .then(() => exec(`npm --prefix ${dir} install ${dir}`))
        .then(() => rollup.rollup({
            input: `${dir}/node_modules/ThunderJS/src/thunderJS.js`,
            plugins: [resolve({browser: true}), commonjs()],
            external: ['ws']
        }))
        .then(bundle => bundle.generate({
            format: 'umd',
            name: `ThunderJS`,
            interop: false
        }))
        .then(content => content.code.replace('var browser = ws;',
            "var browser = ws||require('ws');")) // TODO: how to do this normally
        .then(content => fs.writeFileSync(`./dist/${info.dest}/js/src/thunderJS.js`, content))
        .finally(() => exec(`rm -rf ${dir}`));
}

function copyFetch() {
    const dir = `./dist/${info.dest}/tmp`;
    return exec(`mkdir -p ${dir}`)
        .then(() => fs.writeFileSync(`${dir}/fetch.js`, "import fetch from 'node-fetch';" +
            "export default (typeof fetch !== 'undefined'?fetch:require('node-fetch'))"))
        .then(() => rollup.rollup({
            input: `${dir}/fetch.js`,
            external: ['node-fetch'],
            globals: {'node-fetch': 'fetch'}
        }))
        .then(bundle => bundle.generate({
            format: 'umd',
            name: `fetch`,
            interop: false
        }))
        .then(content => content.code.replace('global.fetch = factory(global.fetch)',
            'global.fetch = factory(global.fetch),global.Headers = global.fetch.Headers')) // TODO: how to do this normally
        .then(content => fs.writeFileSync(`./dist/${info.dest}/js/spark/fetch.js`, content))
        .finally(() => exec(`rm -rf ${dir}`));
}

function copyAppFiles() {
    if (fs.existsSync("./static")) {
        return exec("cp -r ./static ./dist/" + info.dest);
    } else {
        return Promise.resolve();
    }
}

function bundleApp() {
    console.log("Generate rollup bundle for app (src/App.js)");
    return rollup.rollup({input: "./src/App.js"}).then(bundle => {
        return bundle.generate({format: 'umd', name: "appBundle"}).then(content => {
            const location = "./dist/" + info.dest + "/js/src/appBundle.js";
            fs.writeFileSync(location, content.code);
        });
    });
}

function bundleUx() {
    console.log("Generate rollup bundle for ux");
    return rollup.rollup({input: dir + "/js/src/ux.js"}).then(bundle => {
        return bundle.generate({format: 'umd', name: "ux"}).then(content => {
            const location = "./dist/" + info.dest + "/js/src/ux.js";
            fs.writeFileSync(location, content.code);
        });
    });
}

function createBootstrap() {
    console.log("Create bootstrap");
    let bootstrap = {
        "frameworkType": "sparkGL",
        "applicationURL": "init.js",
        "frameworks": []
    };
    let frameworks = [
        "src/lightning-web.js",
        "spark/SparkPlatform.js",
        "spark/fetch.js",
        "src/thunderJS.js",
        "src/ux.js",
        "src/appBundle.js"
    ];
    frameworks.forEach(f => {
        let content = fs.readFileSync(`./dist/${info.dest}/js/${f}`);
        let hash = crypto.createHash('md5').update(content).digest('hex')
        var frameworkData = {}
        frameworkData['url'] = f
        if (f != "src/appBundle.js") {
          frameworkData['md5'] = hash
        }
        bootstrap.frameworks.push(frameworkData);
    });
    const location = `./dist/${info.dest}/js/init.spark`;
    fs.writeFileSync(location, JSON.stringify(bootstrap, null, 4));
}

function ensureSrcDirs() {
    return Promise.all([
        exec("mkdir -p ./dist/" + info.dest + "/js/src"),
        exec("mkdir -p ./dist/" + info.dest + "/js/src.es5")
    ]);
}

function babelify() {
    return Promise.all([
        babelifyFile("./dist/" + info.dest + "/js/src/appBundle.js", "./dist/" + info.dest + "/js/src.es5/appBundle.js"),
        babelifyFile("./dist/" + info.dest + "/js/src/lightning-web.js", "./dist/" + info.dest + "/js/src.es5/lightning-web.js"),
        babelifyFile("./dist/" + info.dest + "/js/src/ux.js", "./dist/" + info.dest + "/js/src.es5/ux.js")
    ])
}
function babelifyFile(inputFile, outputFile) {
    console.log("babelify " + inputFile);
    return new Promise((resolve, reject) => {
        babel.transformFile(inputFile, {presets: [babelPresetEnv]}, function(err, result) {
            if (err) {
                return reject(err);
            }

            fs.writeFileSync(outputFile, result.code);

            resolve();
        });
    });
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
