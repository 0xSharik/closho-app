import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[AppErrorBoundary] Uncaught render error:', error);
    console.error('[AppErrorBoundary] Component stack:', errorInfo.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={styles.container}>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message}>
          This screen hit an unexpected error. Your session and local data have not been cleared.
        </Text>
        <Pressable accessibilityRole="button" style={styles.button} onPress={this.handleRetry}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
        {__DEV__ && this.state.error?.message ? (
          <Text style={styles.debug}>{this.state.error.message}</Text>
        ) : null}
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  message: { color: '#bbb', fontSize: 15, lineHeight: 22, textAlign: 'center', maxWidth: 420 },
  button: { marginTop: 24, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 10, backgroundColor: '#fff' },
  buttonText: { color: '#000', fontWeight: '700' },
  debug: { color: '#777', marginTop: 20, fontSize: 12, textAlign: 'center' },
});
