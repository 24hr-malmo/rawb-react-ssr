import React from 'react';
import PropTypes from 'prop-types';

class RegisterFetchActionProvider extends React.Component {
    static childContextTypes = {
        registerFetchAction: PropTypes.func.isRequired
    }
    getChildContext() {
        return {
            registerFetchAction: (action) => {
                if (this.props.actionCaller) {
                    this.props.actionCaller(action);
                } else {
                    action();
                }
            }
        };
    }
    render() {
        return this.props.children;
    }
}

export default RegisterFetchActionProvider;

