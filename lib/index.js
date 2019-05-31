const React = require('react'); // eslint-disable-line no-unused-vars
const PropTypes = require('prop-types'); // eslint-disable-line no-unused-vars
const renderToString = require('react-dom/server').renderToString;
const Helmet = require('react-helmet').Helmet;

const Loadable = require('react-loadable');
const getBundles = require('react-loadable/webpack').getBundles;

const LRU = require('lru-cache');

const cacheTime = 60; // In seconds

const cache = LRU({ max: 500, maxAge: 1000 * cacheTime });

import RegisterFetchActionProvider from '../register-fetch-action-provider/server';


// Create a promise of the match function from react-routes. We have this step so we can use **yield** later
async function render (context, options) {

    const { key, useCache } = options;

    if (useCache && !key) {
        throw new Error('Cache cannot be set to true if no key provided for the request. Please provide an unique key for the request');
    }

    let modules = [];

    // Since we use the frontend code in the backend ot call it self, we loose the session and the context.
    // And since some of the calls need to be called as an autheticated user, we need to send the correct cookies
    // so that even those calls can check for the user
    const fetchOptionsToPass = {};
    fetchOptionsToPass.headers = {...context.request.header};

    let cached = cache.get(key);

    let isLoggedIn = context.state.user;

    if (options.useCache && cached && !isLoggedIn) {
        context.set('x-l', '1');
        return cached;
    } else {
        context.set('x-l', '0');
    }

    // Make sure that all chunks are loadad
    await Loadable.preloadAll();

    const registerFetchAction = (actions) => (action, name, id) => {
        let key = name + (id ? ':' + id : '');
        let alreadyLoaded = actions.some(action => action.key === key);
        if (!alreadyLoaded) {
            actions.push({fn: action, key, resolved: false});
        }
    };

    let actions = [];
    let previousActionLength = -1;
    let result = null;
    let foundError = false;

    let actionArguments = {
        ...options.arguments,
        fetchOptionsToPass,
    };

    // This will run until it doesnt find any more actions to run, since it will run some actions
    // depending on previous actions
    while (actions.length > previousActionLength) {

        // Iterate trough all grabbed actions and dispatch them.
        let allFetch = actions.reduce((promise, action) => {

            if (typeof action.fn !== 'function') {
                return Promise.reject('action needs to be a function');
            }
            return promise.then(() => {

                if (action.resolved) {
                    return;
                }

                let actionPromise;
                if (options.actionCaller) {
                    actionPromise = options.action(action.fn);
                } else {
                    actionPromise = actions.fn(actionArguments);
                }

                return actionPromise.then(result => {
                    action.resolved = true;
                    if (options.handleResult && typeof options.handleResult === 'function') {
                        return options.handleResult(result, context);
                    }
                    return result;
                });

            });
        }, Promise.resolve());

        // When we are done, we continue.
        await allFetch
            .then()
            .catch((err) => {

                // We dont want to log 404 errors, since it might just be people
                // guessing urls
                context.status = err.status || 500;
                foundError = true;
                if (err.status !== 404) {
                    options.logger.error(err);
                }

            });

        previousActionLength = actions.length;

        // Render everything just to activate all fetching actions.
        // Use Loadable to make a list of all extra bundles wqe want to load
        try {
            result = renderToString( 
                React.createElement(RegisterFetchActionProvider, {registerFetchAction: registerFetchAction(actions)}, options.Root)
            );
        } catch (err) {
            context.status = 500;
            foundError = true;
            options.logger.error('React render while loop error', err.stack);
        }

    }

    try {
        result = renderToString(
            React.createElement(Loadable.Capture, { report: (moduleName) => modules.push(moduleName) }, 
                React.createElement(RegisterFetchActionProvider, {registerFetchAction: registerFetchAction(actions)}, options.Root)
            )
        );
    } catch (err) {
        context.status = 500;
        foundError = true;
        options.logger.error('React render final to string error', err.stack);
    }

    // Get the modules and pick up them just once
    let bundles = [];
    if (options.loadableStats) {
        // Sometimes we get other files, such as map files etc. Lets filter them. It would be better to get a list of files
        // that already is filtered, but this is more convinient for the user of the npm module.
        bundles = getBundles(options.loadableStats, modules).filter(entry => entry.file.match(/\.js/));
    }

    const helmet = Helmet.renderStatic();

    const mergedResult = {
        markup: result,
        bundles,
        title: helmet.title.toString(),
        link: helmet.link.toString(),
        meta: helmet.meta.toString(),
    };

    if (options.useCache && !isLoggedIn && !foundError) {
        cache.set(key, mergedResult);
    }

    return (mergedResult);

}

exports.render = render;
