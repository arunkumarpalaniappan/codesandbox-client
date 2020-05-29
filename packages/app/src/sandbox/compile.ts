import parseConfigurations from '@codesandbox/common/es/templates/configuration/parse';
import getDefinition, {
  TemplateType,
} from '@codesandbox/common/es/templates/index';
import { ParsedConfigurationFiles } from '@codesandbox/common/es/templates/template';
import _debug from '@codesandbox/common/es/utils/debug';
import { isBabel7 } from '@codesandbox/common/es/utils/is-babel-7';
import { absolute } from '@codesandbox/common/es/utils/path';
import VERSION from '@codesandbox/common/es/version';
import { clearErrorTransformers, dispatch, reattach } from 'codesandbox-api';
import { flatten } from 'lodash';
import initializeErrorTransformers from 'sandbox-hooks/errors/transformers';
import { inject, unmount } from 'sandbox-hooks/react-error-overlay/overlay';

import {
  evalBoilerplates,
  findBoilerplate,
  getBoilerplates,
} from './boilerplates';
import defaultBoilerplates from './boilerplates/default-boilerplates';
import createCodeSandboxOverlay from './codesandbox-overlay';
import getPreset from './eval';
import { consumeCache, deleteAPICache, saveCache } from './eval/cache';
import Manager from './eval/manager';
import TranspiledModule from './eval/transpiled-module';
import { Module } from './eval/types/module';
import handleExternalResources from './external-resources';
import { NPMDependencies, loadDependencies } from './npm';
import { resetScreen } from './status-screen';
import { showRunOnClick } from './status-screen/run-on-click';
import * as metrics from './utils/metrics';

let initializedResizeListener = false;
let manager: Manager | null = null;
let actionsEnabled = false;

const debug = _debug('cs:compiler');

export function areActionsEnabled() {
  return actionsEnabled;
}

export function getCurrentManager(): Manager | null {
  return manager;
}

export function getHTMLParts(html: string) {
  if (html.includes('<body>')) {
    const bodyMatcher = /<body.*>([\s\S]*)<\/body>/m;
    const headMatcher = /<head>([\s\S]*)<\/head>/m;

    const headMatch = html.match(headMatcher);
    const bodyMatch = html.match(bodyMatcher);
    const head = headMatch && headMatch[1] ? headMatch[1] : '';
    const body = bodyMatch && bodyMatch[1] ? bodyMatch[1] : html;

    return { body, head };
  }

  return { head: '', body: html };
}

function sendTestCount(
  givenManager: Manager,
  modules: { [path: string]: Module }
) {
  const { testRunner } = givenManager;
  const tests = testRunner.findTests(modules);

  dispatch({
    type: 'test',
    event: 'test_count',
    count: tests.length,
  });
}

let firstLoad = true;
let hadError = false;
let lastHeadHTML = null;
let lastBodyHTML = null;
let lastHeight = 0;
let changedModuleCount = 0;
let usedCache = false;

const DEPENDENCY_ALIASES = {
  '@vue/cli-plugin-babel': '@vue/babel-preset-app',
};

// TODO make devDependencies lazy loaded by the packager
const WHITELISTED_DEV_DEPENDENCIES = [
  'redux-devtools',
  'redux-devtools-dock-monitor',
  'redux-devtools-log-monitor',
  'redux-logger',
  'enzyme',
  'react-addons-test-utils',
  'react-test-renderer',
  'identity-obj-proxy',
  'react-refresh',
];

const BABEL_DEPENDENCIES = [
  'babel-preset-env',
  'babel-preset-latest',
  'babel-preset-es2015',
  'babel-preset-es2015-loose',
  'babel-preset-es2016',
  'babel-preset-es2017',
  'babel-preset-react',
  'babel-preset-stage-0',
  'babel-preset-stage-1',
  'babel-preset-stage-2',
  'babel-preset-stage-3',
];

// Dependencies that we actually don't need, we will replace this by a dynamic
// system in the future
const PREINSTALLED_DEPENDENCIES = [
  'react-scripts',
  'react-scripts-ts',
  'parcel-bundler',
  'babel-plugin-check-es2015-constants',
  'babel-plugin-external-helpers',
  'babel-plugin-inline-replace-variables',
  'babel-plugin-syntax-async-functions',
  'babel-plugin-syntax-async-generators',
  'babel-plugin-syntax-class-constructor-call',
  'babel-plugin-syntax-class-properties',
  'babel-plugin-syntax-decorators',
  'babel-plugin-syntax-do-expressions',
  'babel-plugin-syntax-exponentiation-operator',
  'babel-plugin-syntax-export-extensions',
  'babel-plugin-syntax-flow',
  'babel-plugin-syntax-function-bind',
  'babel-plugin-syntax-function-sent',
  'babel-plugin-syntax-jsx',
  'babel-plugin-syntax-object-rest-spread',
  'babel-plugin-syntax-trailing-function-commas',
  'babel-plugin-transform-async-functions',
  'babel-plugin-transform-async-to-generator',
  'babel-plugin-transform-async-to-module-method',
  'babel-plugin-transform-class-constructor-call',
  'babel-plugin-transform-class-properties',
  'babel-plugin-transform-decorators',
  'babel-plugin-transform-decorators-legacy',
  'babel-plugin-transform-do-expressions',
  'babel-plugin-transform-es2015-arrow-functions',
  'babel-plugin-transform-es2015-block-scoped-functions',
  'babel-plugin-transform-es2015-block-scoping',
  'babel-plugin-transform-es2015-classes',
  'babel-plugin-transform-es2015-computed-properties',
  'babel-plugin-transform-es2015-destructuring',
  'babel-plugin-transform-es2015-duplicate-keys',
  'babel-plugin-transform-es2015-for-of',
  'babel-plugin-transform-es2015-function-name',
  'babel-plugin-transform-es2015-instanceof',
  'babel-plugin-transform-es2015-literals',
  'babel-plugin-transform-es2015-modules-amd',
  'babel-plugin-transform-es2015-modules-commonjs',
  'babel-plugin-transform-es2015-modules-systemjs',
  'babel-plugin-transform-es2015-modules-umd',
  'babel-plugin-transform-es2015-object-super',
  'babel-plugin-transform-es2015-parameters',
  'babel-plugin-transform-es2015-shorthand-properties',
  'babel-plugin-transform-es2015-spread',
  'babel-plugin-transform-es2015-sticky-regex',
  'babel-plugin-transform-es2015-template-literals',
  'babel-plugin-transform-es2015-typeof-symbol',
  'babel-plugin-transform-es2015-unicode-regex',
  'babel-plugin-transform-es3-member-expression-literals',
  'babel-plugin-transform-es3-property-literals',
  'babel-plugin-transform-es5-property-mutators',
  'babel-plugin-transform-eval',
  'babel-plugin-transform-exponentiation-operator',
  'babel-plugin-transform-export-extensions',
  'babel-plugin-transform-flow-comments',
  'babel-plugin-transform-flow-strip-types',
  'babel-plugin-transform-function-bind',
  'babel-plugin-transform-jscript',
  'babel-plugin-transform-object-assign',
  'babel-plugin-transform-object-rest-spread',
  'babel-plugin-transform-object-set-prototype-of-to-assign',
  'babel-plugin-transform-proto-to-assign',
  'babel-plugin-transform-react-constant-elements',
  'babel-plugin-transform-react-display-name',
  'babel-plugin-transform-react-inline-elements',
  'babel-plugin-transform-react-jsx',
  'babel-plugin-transform-react-jsx-compat',
  'babel-plugin-transform-react-jsx-self',
  'babel-plugin-transform-react-jsx-source',
  'babel-plugin-transform-regenerator',
  'babel-plugin-transform-runtime',
  'babel-plugin-transform-strict-mode',
  'babel-plugin-undeclared-variables-check',
  'babel-plugin-dynamic-import-node',
  'babel-plugin-detective',
  'babel-plugin-transform-prevent-infinite-loops',
  'babel-plugin-transform-vue-jsx',
  'flow-bin',
  ...BABEL_DEPENDENCIES,
];

function getDependencies(
  parsedPackage,
  templateDefinition,
  configurations
): NPMDependencies {
  const {
    dependencies: d = {},
    peerDependencies = {},
    devDependencies = {},
  } = parsedPackage;

  let returnedDependencies = { ...peerDependencies };

  const foundWhitelistedDevDependencies = [...WHITELISTED_DEV_DEPENDENCIES];

  // Add all babel plugins/presets to whitelisted dependencies
  if (configurations && configurations.babel && configurations.babel.parsed) {
    flatten(configurations.babel.parsed.presets || [])
      .filter(p => typeof p === 'string')
      .forEach((p: string) => {
        const [first, ...parts] = p.split('/');
        const prefixedName = p.startsWith('@')
          ? first + '/babel-preset-' + parts.join('/')
          : `babel-preset-${p}`;

        foundWhitelistedDevDependencies.push(p);
        foundWhitelistedDevDependencies.push(prefixedName);
      });

    flatten(configurations.babel.parsed.plugins || [])
      .filter(p => typeof p === 'string')
      .forEach((p: string) => {
        const [first, ...parts] = p.split('/');
        const prefixedName = p.startsWith('@')
          ? first + '/babel-plugin-' + parts.join('/')
          : `babel-plugin-${p}`;

        foundWhitelistedDevDependencies.push(p);
        foundWhitelistedDevDependencies.push(prefixedName);
      });
  }

  Object.keys(d).forEach(dep => {
    const usedDep = DEPENDENCY_ALIASES[dep] || dep;

    if (dep === 'reason-react') {
      return; // is replaced
    }

    returnedDependencies[usedDep] = d[dep];
  });

  Object.keys(devDependencies).forEach(dep => {
    const usedDep = DEPENDENCY_ALIASES[dep] || dep;

    if (foundWhitelistedDevDependencies.indexOf(usedDep) > -1) {
      if (
        usedDep === '@vue/babel-preset-app' &&
        devDependencies[dep].startsWith('^3')
      ) {
        // Native modules got added in 3.7.0, we need to hardcode to latest
        // working version of the babel plugin as a fix. https://twitter.com/notphanan/status/1122475053633941509
        returnedDependencies[usedDep] = '3.6.0';
        return;
      }

      returnedDependencies[usedDep] = devDependencies[dep];
    }
  });

  const sandpackConfig =
    (configurations.customTemplate &&
      configurations.customTemplate.parsed &&
      configurations.customTemplate.parsed.sandpack) ||
    {};

  const preinstalledDependencies =
    sandpackConfig.preInstalledDependencies == null
      ? PREINSTALLED_DEPENDENCIES
      : sandpackConfig.preInstalledDependencies;

  if (templateDefinition.name === 'reason') {
    returnedDependencies = {
      ...returnedDependencies,
      '@jaredly/bs-core': '3.0.0-alpha.2',
      '@jaredly/reason-react': '0.3.4',
    };
  }

  // Always include this, because most sandboxes need this with babel6 and the
  // packager will only include the package.json for it.
  if (isBabel7(d, devDependencies)) {
    returnedDependencies['@babel/runtime'] =
      returnedDependencies['@babel/runtime'] || '7.3.1';
  } else {
    returnedDependencies['babel-runtime'] =
      returnedDependencies['babel-runtime'] || '6.26.0';
  }

  // This is used for cache busting
  returnedDependencies.csbbust = '1.0.0';
  returnedDependencies['node-libs-browser'] = '2.2.0';

  preinstalledDependencies.forEach(dep => {
    if (returnedDependencies[dep]) {
      delete returnedDependencies[dep];
    }
  });

  return returnedDependencies;
}

function initializeManager(
  sandboxId: string,
  template: TemplateType,
  modules: { [path: string]: Module },
  configurations: ParsedConfigurationFiles,
  { hasFileResolver = false }: { hasFileResolver?: boolean } = {}
) {
  return new Manager(
    sandboxId,
    getPreset(template, configurations.package.parsed),
    modules,
    {
      hasFileResolver,
    }
  );
}

async function updateManager(
  managerModules: { [path: string]: Module },
  configurations: ParsedConfigurationFiles
): Promise<TranspiledModule[]> {
  manager.updateConfigurations(configurations);
  await manager.preset.setup(manager);
  return manager.updateData(managerModules).then(x => {
    changedModuleCount = x.length;
    return x;
  });
}

function getDocumentHeight() {
  const { body } = document;
  const html = document.documentElement;

  return Math.max(
    body.scrollHeight,
    body.offsetHeight,
    html.clientHeight,
    html.scrollHeight,
    html.offsetHeight
  );
}

function sendResize() {
  const height = getDocumentHeight();

  if (lastHeight !== height) {
    if (document.body) {
      dispatch({
        type: 'resize',
        height,
      });
    }
  }

  lastHeight = height;
}

function initializeResizeListener() {
  setInterval(sendResize, 5000);

  initializedResizeListener = true;
}

function overrideDocumentClose() {
  const oldClose = window.document.close;

  window.document.close = function close(...args) {
    try {
      oldClose.call(document, args);
    } finally {
      inject();
      reattach();
    }
  };
}

overrideDocumentClose();

inject();

interface CompileOptions {
  sandboxId: string;
  modules: { [path: string]: Module };
  externalResources: string[];
  hasActions?: boolean;
  isModuleView?: boolean;
  template: TemplateType;
  entry: string;
  showOpenInCodeSandbox?: boolean;
  skipEval?: boolean;
  hasFileResolver?: boolean;
  disableDependencyPreprocessing?: boolean;
}

async function compile({
  sandboxId,
  modules,
  externalResources,
  hasActions,
  isModuleView = false,
  template,
  entry,
  showOpenInCodeSandbox = false,
  skipEval = false,
  hasFileResolver = false,
  disableDependencyPreprocessing = false,
}: CompileOptions) {
  dispatch({
    type: 'start',
  });
  metrics.measure('compilation');

  const startTime = Date.now();
  try {
    inject();
    clearErrorTransformers();
    initializeErrorTransformers();
    unmount(manager && manager.webpackHMR ? true : hadError);
  } catch (e) {
    console.error(e);
  }

  hadError = false;

  actionsEnabled = hasActions;

  let managerModuleToTranspile = null;
  try {
    const templateDefinition = getDefinition(template);
    const configurations = parseConfigurations(
      template,
      templateDefinition.configurationFiles,
      path => modules[path]
    );

    const errors = Object.keys(configurations)
      .map(c => configurations[c])
      .filter(x => x.error);

    if (errors.length) {
      const e = new Error(
        `We weren't able to parse: '${errors[0].path}': ${errors[0].error.message}`
      );

      // @ts-ignore
      e.fileName = errors[0].path;

      throw e;
    }

    const packageJSON = modules['/package.json'];

    if (!packageJSON) {
      throw new Error('Could not find package.json');
    }

    const parsedPackageJSON = configurations.package.parsed;

    dispatch({ type: 'status', status: 'installing-dependencies' });

    manager =
      manager ||
      initializeManager(sandboxId, template, modules, configurations, {
        hasFileResolver,
      });

    let dependencies: NPMDependencies = getDependencies(
      parsedPackageJSON,
      templateDefinition,
      configurations
    );

    dependencies = await manager.preset.processDependencies(dependencies);

    metrics.measure('dependencies');
    const { manifest, isNewCombination } = await loadDependencies(
      dependencies,
      {
        disableExternalConnection: disableDependencyPreprocessing,
        resolutions: parsedPackageJSON.resolutions,
        showFullScreen: firstLoad,
      }
    );
    metrics.endMeasure('dependencies', { displayName: 'Dependencies' });

    const shouldReloadManager =
      (isNewCombination && !firstLoad) || manager.id !== sandboxId;

    if (shouldReloadManager) {
      // Just reset the whole manager if it's a new combination
      manager.dispose();

      manager = initializeManager(
        sandboxId,
        template,
        modules,
        configurations,
        { hasFileResolver }
      );
    }

    if (shouldReloadManager || firstLoad) {
      // Now initialize the data the manager can only use once dependencies are loaded

      manager.setManifest(manifest);
      // We save the state of transpiled modules, and load it here again. Gives
      // faster initial loads.
      usedCache = await consumeCache(manager);
    }

    metrics.measure('transpilation');

    const updatedModules = (await updateManager(modules, configurations)) || [];

    const possibleEntries = templateDefinition.getEntries(configurations);

    const foundMain = isModuleView
      ? entry
      : possibleEntries.find(p => Boolean(modules[p]));

    if (!foundMain) {
      throw new Error(
        `Could not find entry file: ${possibleEntries[0]}. You can specify one in package.json by defining a \`main\` property.`
      );
    }

    const main = absolute(foundMain);
    managerModuleToTranspile = modules[main];

    dispatch({ type: 'status', status: 'transpiling' });
    manager.setStage('transpilation');

    await manager.verifyTreeTranspiled();
    await manager.transpileModules(managerModuleToTranspile);

    metrics.endMeasure('transpilation', { displayName: 'Transpilation' });

    dispatch({ type: 'status', status: 'evaluating' });
    manager.setStage('evaluation');

    if (!skipEval) {
      resetScreen();

      try {
        // We set it as a time value for people that run two sandboxes on one computer
        // they execute at the same time and we don't want them to conflict, so we check
        // if the message was set a second ago
        if (
          firstLoad &&
          localStorage.getItem('running') &&
          Date.now() - +localStorage.getItem('running') > 8000
        ) {
          localStorage.removeItem('running');
          showRunOnClick();
          return;
        }

        localStorage.setItem('running', '' + Date.now());
      } catch (e) {
        /* no */
      }

      await manager.preset.preEvaluate(manager, updatedModules);

      if (!manager.webpackHMR) {
        const htmlModulePath = templateDefinition
          .getHTMLEntries(configurations)
          .find(p => Boolean(modules[p]));
        const htmlModule = modules[htmlModulePath];

        const { head, body } = getHTMLParts(
          htmlModule && htmlModule.code
            ? htmlModule.code
            : template === 'vue-cli'
            ? '<div id="app"></div>'
            : '<div id="root"></div>'
        );

        if (lastHeadHTML && lastHeadHTML !== head) {
          document.location.reload();
        }
        if (manager && lastBodyHTML && lastBodyHTML !== body) {
          manager.clearCompiledCache();
        }

        if (
          !manager.preset.htmlDisabled ||
          !firstLoad ||
          process.env.LOCAL_SERVER
        ) {
          // The HTML is loaded from the server as a static file, no need to set the innerHTML of the body
          // on the first run.
          document.body.innerHTML = body;
        }
        lastBodyHTML = body;
        lastHeadHTML = head;
      }

      metrics.measure('external-resources');
      await handleExternalResources(externalResources);
      metrics.endMeasure('external-resources', {
        displayName: 'External Resources',
      });

      const oldHTML = document.body.innerHTML;
      metrics.measure('evaluation');
      const evalled = manager.evaluateModule(managerModuleToTranspile, {
        force: isModuleView,
      });
      metrics.endMeasure('evaluation', { displayName: 'Evaluation' });

      const domChanged =
        !manager.preset.htmlDisabled && oldHTML !== document.body.innerHTML;

      if (
        isModuleView &&
        !domChanged &&
        !managerModuleToTranspile.path.endsWith('.html')
      ) {
        const isReact =
          managerModuleToTranspile.code &&
          managerModuleToTranspile.code.includes('React');

        if (isReact && evalled) {
          // initiate boilerplates
          if (getBoilerplates().length === 0) {
            try {
              await evalBoilerplates(defaultBoilerplates);
            } catch (e) {
              // eslint-disable-next-line no-console
              console.log("Couldn't load all boilerplates: " + e.message);
            }
          }

          const boilerplate = findBoilerplate(managerModuleToTranspile);

          if (boilerplate) {
            try {
              boilerplate.module.default(evalled);
            } catch (e) {
              console.error(e);
            }
          }
        }
      }
    }

    await manager.preset.teardown(manager, updatedModules);

    if (!initializedResizeListener && !manager.preset.htmlDisabled) {
      initializeResizeListener();
    }

    if (showOpenInCodeSandbox) {
      createCodeSandboxOverlay(modules);
    }

    debug(`Total time: ${Date.now() - startTime}ms`);

    metrics.endMeasure('compilation', { displayName: 'Compilation' });
    metrics.endMeasure('total', { displayName: 'Total', lastTime: 0 });
    dispatch({
      type: 'success',
    });

    saveCache(
      sandboxId,
      managerModuleToTranspile,
      manager,
      changedModuleCount,
      firstLoad
    );

    setTimeout(async () => {
      try {
        await manager.initializeTestRunner();
        sendTestCount(manager, modules);
      } catch (e) {
        if (process.env.NODE_ENV === 'development') {
          console.error('Test error', e);
        }
      }
    }, 600);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log('Error in sandbox:');
    console.error(e);

    if (manager) {
      manager.clearCache();

      if (firstLoad && changedModuleCount === 0) {
        await deleteAPICache(manager.id);
      }
    }

    if (firstLoad) {
      inject();
    }

    const event = new Event('error');
    // @ts-ignore
    event.error = e;

    window.dispatchEvent(event);

    hadError = true;
  } finally {
    setTimeout(() => {
      try {
        // Set a timeout so there's a chance that we also catch runtime errors
        localStorage.removeItem('running');
      } catch (e) {
        /* no */
      }
    }, 600);

    if (manager) {
      const managerState = {
        ...(await manager.serialize({ optimizeForSize: false })),
      };
      delete managerState.cachedPaths;
      managerState.entry = managerModuleToTranspile
        ? managerModuleToTranspile.path
        : null;

      dispatch({
        type: 'state',
        state: managerState,
      });

      manager.isFirstLoad = false;
    }

    if (firstLoad) {
      metrics
        .persistMeasurements({
          sandboxId,
          cacheUsed: usedCache,
          browser: navigator.userAgent,
          version: VERSION,
        })
        .catch(() => {
          /* Do nothing with the error */
        });
    }
  }
  firstLoad = false;

  dispatch({ type: 'status', status: 'idle' });
  dispatch({ type: 'done', compilatonError: hadError });

  if (typeof (window as any).__puppeteer__ === 'function') {
    setTimeout(() => {
      // Give everything some time to evaluate
      (window as any).__puppeteer__('done');
    }, 100);
  }
}

const tasks: CompileOptions[] = [];
let runningTask = null;

async function executeTaskIfAvailable() {
  if (tasks.length) {
    runningTask = tasks.pop();
    await compile(runningTask);
    runningTask = null;

    executeTaskIfAvailable();
  }
}

/**
 * We want to ensure that no tasks (commands from the editor) are run in parallel,
 * this could result in state inconsistency. That's why we execute tasks after eachother,
 * and if there are 3 tasks we will remove the second task, this one is unnecessary as it is not the
 * latest version.
 */
export default function queueTask(data: CompileOptions) {
  // If same task is running, ignore it.
  if (runningTask && JSON.stringify(runningTask) === JSON.stringify(data)) {
    return;
  }

  tasks[0] = data;

  if (!runningTask) {
    executeTaskIfAvailable();
  }
}
