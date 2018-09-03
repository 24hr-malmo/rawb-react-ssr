const reactSSR = require('../');

// options.loadableStats = stats
// options.reducers = reducers

async function test() {

    const fakeContext = {
        req: {
            url: '/tjena/data',
        },
        cookies: {
            get: (key) => { console.log('get cookie', key) }, // eslint-disable-line
        },
        set: (name, value) => { console.log('set header', name, value) }, // eslint-disable-line
        status: 200,
        language: 'se',
        state: {
            user: { },
        },
        redirect: (url) => { console.log('redirect to', url) }, // eslint-disable-line
        request: {
            header: {
                'user-agent': 'user agent',
                'host': 'test.com',
                'x-site-id': 'site-id',
            }
        }
    };

    const state = {
        settings: {
            mobile: true,
            userAgent: {
                browser: {
                    name: 'test',
                }
            }
        }
    };

    const options = {
        useCache: false,
        logger: {
            verbose: (...options) => console.log(...options), // eslint-disable-line
            error: (...options) => console.log(...options), // eslint-disable-line
        },
        App: () => '<html/>',
    };

    try {

        const result = await reactSSR.render(
            fakeContext,
            state,
            options
        );

        console.log(result);

    } catch (err) {
        console.log(err.stack);
    }


}

test();
