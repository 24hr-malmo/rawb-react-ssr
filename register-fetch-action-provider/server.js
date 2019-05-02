class RegisterFetchActionProvider extends React.Component {
    static childContextTypes = {
        registerFetchAction: PropTypes.func.isRequired
    }
    getChildContext() {
        return {
            registerFetchAction: this.props.registerFetchAction
        };
    }
    render() {
        return this.props.children;
    }
}

export default RegisterFetchActionProvider

