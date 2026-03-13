// Minimal vscode module mock for unit testing

class MockUri {
    readonly scheme: string;
    readonly authority: string;
    readonly path: string;
    readonly query: string;
    readonly fragment: string;

    constructor(scheme: string, authority: string, path: string, query: string = '', fragment: string = '') {
        this.scheme = scheme;
        this.authority = authority;
        this.path = path;
        this.query = query;
        this.fragment = fragment;
    }

    with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): MockUri {
        return new MockUri(
            change.scheme ?? this.scheme,
            change.authority ?? this.authority,
            change.path ?? this.path,
            change.query ?? this.query,
            change.fragment ?? this.fragment,
        );
    }

    toString(): string {
        let result = `${this.scheme}://${this.authority}${this.path}`;
        if (this.query) { result += `?${this.query}`; }
        if (this.fragment) { result += `#${this.fragment}`; }
        return result;
    }

    static parse(value: string): MockUri {
        const url = new URL(value);
        return new MockUri(
            url.protocol.replace(':', ''),
            decodeURIComponent(url.hostname),
            url.pathname,
            url.search.replace('?', ''),
        );
    }
}

export const Uri = MockUri;
export class TreeItem {
    label?: string;
    collapsibleState?: TreeItemCollapsibleState;
    description?: string;
    tooltip?: any;
    iconPath?: any;
    contextValue?: string;
    command?: any;
    constructor(label?: string, collapsibleState?: TreeItemCollapsibleState) {
        if (typeof label === 'string') { this.label = label; }
        this.collapsibleState = collapsibleState;
    }
}
export enum TreeItemCollapsibleState { None = 0, Collapsed = 1, Expanded = 2 }
export class ThemeIcon { constructor(public id: string, public color?: any) {} }
export class ThemeColor { constructor(public id: string) {} }
export class MarkdownString {
    value: string;
    constructor(value?: string) { this.value = value ?? ''; }
}
export class EventEmitter { fire() {} event = () => {}; }
export const window = { showErrorMessage: jest.fn(), showInformationMessage: jest.fn(), showInputBox: jest.fn(), showTextDocument: jest.fn() };
export const workspace = {
    openTextDocument: jest.fn(),
    getConfiguration: jest.fn().mockReturnValue({
        get: jest.fn().mockImplementation((_key: string, defaultValue?: unknown) => defaultValue),
    }),
};
export const commands = {};
export const env = {};
