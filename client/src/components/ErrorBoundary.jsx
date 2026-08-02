import { Component } from 'react'

/**
 * Top-level error boundary. Renders the 500 page whenever any descendant
 * component throws during render, lifecycle, or in effects, instead of
 * unmounting the whole tree into a blank screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Log so it shows up in the browser console for debugging
    console.error('ErrorBoundary caught:', error, info)
  }

  handleReload = () => {
    // Reset the boundary so the user can try again without a hard refresh
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="min-h-screen bg-canvas text-ink">
        <div className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-5 py-16 text-center sm:px-8">
          <p className="font-mono text-xs font-medium uppercase tracking-[0.18em] text-danger">Error 500</p>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-6xl">Something went wrong on our end.</h1>
          <p className="mt-6 max-w-xl text-pretty text-lg leading-8 text-muted">
            The page hit an unexpected error while rendering. The issue has been logged. You can try again, or head back to the home page.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex rounded-lg bg-ink px-5 py-3 text-sm font-medium text-on-primary hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Try again
            </button>
            <a
              href="/"
              className="inline-flex rounded-lg border border-hairline bg-surface px-5 py-3 text-sm font-medium text-ink hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              ← Back to home
            </a>
            <a
              href="/contact"
              className="inline-flex rounded-lg border border-hairline bg-surface px-5 py-3 text-sm font-medium text-ink hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Report this issue
            </a>
          </div>
        </div>
      </div>
    )
  }
}