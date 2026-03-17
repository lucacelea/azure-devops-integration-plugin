import { appendWorkItemsToTemplate } from '../commands/createPr';

describe('appendWorkItemsToTemplate', () => {
    it('returns undefined when template is undefined and no work items', () => {
        expect(appendWorkItemsToTemplate(undefined, [])).toBeUndefined();
    });

    it('returns template unchanged when no work items are provided', () => {
        const template = '## Description\n\nPlease describe your changes.';
        expect(appendWorkItemsToTemplate(template, [])).toBe(template);
    });

    it('returns only work item title when template is undefined', () => {
        expect(appendWorkItemsToTemplate(undefined, ['Fix login button styling'])).toBe('Fix login button styling');
    });

    it('returns multiple work item titles when template is undefined', () => {
        expect(appendWorkItemsToTemplate(undefined, ['Fix login button styling', 'Update dashboard layout'])).toBe(
            'Fix login button styling\nUpdate dashboard layout'
        );
    });

    it('appends work item title to the bottom of the template', () => {
        const template = '## Description\n\nPlease describe your changes.';
        const result = appendWorkItemsToTemplate(template, ['Fix login button styling']);
        expect(result).toBe('## Description\n\nPlease describe your changes.\n\nFix login button styling');
    });

    it('appends multiple work item titles to the bottom of the template', () => {
        const template = '## Description\n\nPlease describe your changes.';
        const result = appendWorkItemsToTemplate(template, ['Fix login button styling', 'Update dashboard layout', 'Add error handling']);
        expect(result).toBe('## Description\n\nPlease describe your changes.\n\nFix login button styling\nUpdate dashboard layout\nAdd error handling');
    });

    it('trims trailing whitespace from template before appending', () => {
        const template = '## Description\n\nPlease describe your changes.\n\n';
        const result = appendWorkItemsToTemplate(template, ['Fix login button styling']);
        expect(result).toBe('## Description\n\nPlease describe your changes.\n\nFix login button styling');
    });
});
