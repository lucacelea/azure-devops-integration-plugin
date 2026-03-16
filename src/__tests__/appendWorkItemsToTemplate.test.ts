import { appendWorkItemsToTemplate } from '../commands/createPr';

describe('appendWorkItemsToTemplate', () => {
    it('returns undefined when template is undefined and no work items', () => {
        expect(appendWorkItemsToTemplate(undefined, [])).toBeUndefined();
    });

    it('returns template unchanged when no work items are provided', () => {
        const template = '## Description\n\nPlease describe your changes.';
        expect(appendWorkItemsToTemplate(template, [])).toBe(template);
    });

    it('returns only work item references when template is undefined', () => {
        expect(appendWorkItemsToTemplate(undefined, [181406])).toBe('#181406');
    });

    it('returns multiple work item references when template is undefined', () => {
        expect(appendWorkItemsToTemplate(undefined, [181406, 181407])).toBe('#181406\n#181407');
    });

    it('appends work items to the bottom of the template', () => {
        const template = '## Description\n\nPlease describe your changes.';
        const result = appendWorkItemsToTemplate(template, [181406]);
        expect(result).toBe('## Description\n\nPlease describe your changes.\n\n#181406');
    });

    it('appends multiple work items to the bottom of the template', () => {
        const template = '## Description\n\nPlease describe your changes.';
        const result = appendWorkItemsToTemplate(template, [181406, 181407, 181408]);
        expect(result).toBe('## Description\n\nPlease describe your changes.\n\n#181406\n#181407\n#181408');
    });

    it('trims trailing whitespace from template before appending', () => {
        const template = '## Description\n\nPlease describe your changes.\n\n';
        const result = appendWorkItemsToTemplate(template, [181406]);
        expect(result).toBe('## Description\n\nPlease describe your changes.\n\n#181406');
    });
});
