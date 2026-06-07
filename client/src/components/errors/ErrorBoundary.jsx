import { Component } from "react";

import { ErrorState } from "../ui/ErrorState.jsx";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === "function") {
      try {
        this.props.onError(error, info);
      } catch {
        // ignore logger failures
      }
    }
  }

  handleReset = () => {
    this.setState({ error: null });
    if (typeof this.props.onReset === "function") {
      try {
        this.props.onReset();
      } catch {
        // ignore
      }
    }
  };

  componentDidUpdate(prevProps) {
    if (
      this.state.error &&
      prevProps.resetKey !== this.props.resetKey
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    const { Fallback, fallbackTitle, fallbackMessage, children, resetKey } = this.props;
    const { error } = this.state;

    if (error) {
      if (Fallback) {
        return <Fallback error={error} reset={this.handleReset} />;
      }
      const isDev =
        typeof import.meta !== "undefined" && import.meta.env?.DEV === true;
      return (
        <ErrorState
          title={fallbackTitle || "Something went wrong"}
          message={
            fallbackMessage ||
            (isDev && error?.message ? error.message : "Please retry or reload the page.")
          }
          onRetry={this.handleReset}
        />
      );
    }

    return typeof children === "function"
      ? children({ resetKey })
      : children;
  }
}
