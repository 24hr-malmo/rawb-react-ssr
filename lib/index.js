const React = require('react'); // eslint-disable-line no-unused-vars
const renderToString = require('react-dom/server').renderToString;
const StaticRouter = require('react-router').StaticRouter;
const Helmet = require('react-helmet').Helmet;
const Provider = require('react-redux').Provider;

const redux = require('redux');
const combineReducers = redux.combineReducers;
const createStore = redux.createStore;
const applyMiddleware = redux.applyMiddleware;

const thunk = require('redux-thunk').default;

const Loadable = require('react-loadable');
const getBundles = require('react-loadable/webpack').getBundles;

const LRU = require('lru-cache');
const he = require('he');

const cacheTime = 60; // In seconds

const cache = LRU({ max: 500, maxAge: 1000 * cacheTime });

// options.useCache = config.USE_CACHE;
// options.loadableStats = stats
// options.reducers = reducers
// options.logger = logger
// options.App = App

// Create a promise of the match function from react-routes. We have this step so we can use **yield** later
async function render (context, appState, options) {

    let decodedRequestUrl = decodeURIComponent(context.req.url);
    decodedRequestUrl = he.decode(decodedRequestUrl);
    let requestUrl = decodedRequestUrl.replace(/[^-a-zA-Z/0-9)=\?&_%\s:]/gm, '');
    requestUrl = encodeURI(requestUrl);

    let modules = [];

    // Since we use the frontend code in the backend ot call it self, we loose the session and the context.
    // And since some of the calls need to be called as an autheticated user, we need to send the correct cookies
    // so that even those calls can check for the user
    const fetchOptionsToPass = {};

    fetchOptionsToPass.headers = fetchOptionsToPass.headers || {};
    fetchOptionsToPass.headers.Cookie = context.request.header.cookie;
    fetchOptionsToPass.headers['user-agent'] = context.request.header['user-agent'];
    fetchOptionsToPass.headers['host'] = context.request.header['host'];

    // Copy all custom headers. Maybe we should send all headers, but we filter them for now
    Object.keys(context.request.header).forEach(key => {
        if (key.includes('x-')) {
            fetchOptionsToPass.headers[key] = context.request.header[key];
        }
    });

    const device = appState.settings.mobile ? 'mobile' : 'desktop';

    // We need to cache the result by browser as well, since some featrues are render differently in ie11
    const browser = `${appState.settings.userAgent.browser.name}`.toLowerCase();
    const language = context.locals ? context.locals.language : ctx.language;
    const key = `${language}-${device}-${requestUrl}-${browser}`;

    let cached = cache.get(key);

    let isLoggedIn = context.state.user;

    if (options.useCache && cached && !isLoggedIn) {
        context.set('x-l', '1');
        return cached;
    } else {
        context.set('x-l', '0');
    }

    const registerFetchAction = (actions) => (action, name, id) => {
        let key = name + (id ? ':' + id : '');
        let alreadyLoaded = actions.some(action => action.key === key);
        if (!alreadyLoaded) {
            actions.push({fn: action, key, resolved: false});
        }
    };

    const combined = combineReducers({ ...options.reducers });
    const store = createStore(
        combined,
        appState, 
        applyMiddleware(thunk)
    );

    let actions = [];
    let previousActionLength = -1;
    let result = null;
    let foundError = false;
    

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

                return action.fn(store.dispatch, store.getState(), fetchOptionsToPass)
                    .then(result => {
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
                React.createElement(Provider, { store },
                    React.createElement(StaticRouter, { location: requestUrl, context }, 
                        React.createElement(options.App, { renderType: 'shallow', registerFetchAction: registerFetchAction(actions) }, null)
                    )
                )
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
                React.createElement(Provider, { store }, 
                    React.createElement(StaticRouter, { location: requestUrl, context }, 
                        React.createElement(options.App, { registerFetchAction: registerFetchAction(actions) }, null)
                    )
                )
            )
        );
    } catch (err) {
        context.status = 500;
        foundError = true;
        options.logger.error('React render final to string error', err.stack);
    }

    const state = store.getState();

    // Get the modules and pick up them just once
    let bundles = [];
    
    if (options.loadableStats) {
        bundles = getBundles(options.loadableStats, modules).reduce((list, bundle) => {
            if (!list.some(current => current.id === bundle.id)) {
                list.push(bundle);
            }
            return list;
        }, []);
    }

    const helmet = Helmet.renderStatic();

    const mergedResult = {
        markup: result,
        appState: state,
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
