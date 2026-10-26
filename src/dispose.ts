export interface DisposableLike {
  dispose(): void;
}

export function disposeAll(disposables: DisposableLike[]): void {
  while (disposables.length) {
    const item = disposables.pop();
    if (item) {
      item.dispose();
    }
  }
}

export abstract class Disposable {
  protected _isDisposed = false;

  protected _disposables: DisposableLike[] = [];

  public dispose() {
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    disposeAll(this._disposables);
  }

  protected _register<T extends DisposableLike>(value: T): T {
    if (this._isDisposed) {
      value.dispose();
    } else {
      this._disposables.push(value);
    }
    return value;
  }
}
