import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import * as cheerio from 'cheerio';

type ExtractType = 'text' | 'html' | 'outerHtml' | 'attr';

interface FieldDef {
	name: string;
	selector?: string;
	extract: ExtractType;
	attribute?: string;
}

const extractOptions = [
	{ name: 'Text', value: 'text', description: 'Text content, like jQuery .text()' },
	{ name: 'Inner HTML', value: 'html', description: 'Inner HTML, like jQuery .html()' },
	{ name: 'Outer HTML', value: 'outerHtml', description: 'The element itself including its tag' },
	{ name: 'Attribute', value: 'attr', description: 'Value of an attribute, like jQuery .attr()' },
];

function extractValue(
	$: cheerio.CheerioAPI,
	el: cheerio.Cheerio<any>,
	extract: ExtractType,
	attribute: string,
): string | undefined {
	switch (extract) {
		case 'html':
			return el.html() ?? '';
		case 'outerHtml':
			return $.html(el);
		case 'attr':
			return el.attr(attribute);
		default:
			return el.text();
	}
}

export class HtmlSelector implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'HTML Selector',
		name: 'htmlSelector',
		icon: 'file:htmlSelector.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["mode"] === "rows" ? $parameter["rowSelector"] : $parameter["selector"]}}',
		description: 'Select elements from an HTML string with CSS selectors and extract text, HTML or attributes',
		defaults: { name: 'HTML Selector' },
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'HTML',
				name: 'html',
				type: 'string',
				typeOptions: { rows: 4 },
				default: '',
				required: true,
				placeholder: '={{ $json.html }}',
				description: 'The HTML string to parse',
			},
			{
				displayName: 'Mode',
				name: 'mode',
				type: 'options',
				default: 'single',
				options: [
					{
						name: 'Single Selector',
						value: 'single',
						description: 'Extract one value from every element matching a selector',
					},
					{
						name: 'Rows With Fields',
						value: 'rows',
						description: 'Match repeating row elements and extract several named fields from each',
					},
				],
			},

			// ---------- Single selector mode ----------
			{
				displayName: 'CSS Selector',
				name: 'selector',
				type: 'string',
				default: 'span.lbl-txt',
				required: true,
				placeholder: 'div > span.lbl-txt',
				displayOptions: { show: { mode: ['single'] } },
			},
			{
				displayName: 'Extract',
				name: 'extract',
				type: 'options',
				default: 'text',
				options: extractOptions,
				displayOptions: { show: { mode: ['single'] } },
			},
			{
				displayName: 'Attribute Name',
				name: 'attribute',
				type: 'string',
				default: '',
				placeholder: 'href',
				required: true,
				displayOptions: { show: { mode: ['single'], extract: ['attr'] } },
			},

			// ---------- Rows mode ----------
			{
				displayName: 'Row Selector',
				name: 'rowSelector',
				type: 'string',
				default: '.child-div',
				required: true,
				placeholder: '.child-div',
				description: 'Selector for the repeating element. One output item is created per match.',
				displayOptions: { show: { mode: ['rows'] } },
			},
			{
				displayName: 'Fields',
				name: 'fields',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				placeholder: 'Add Field',
				default: {},
				description: 'Values to extract from each row',
				displayOptions: { show: { mode: ['rows'] } },
				options: [
					{
						name: 'field',
						displayName: 'Field',
						values: [
							{
								displayName: 'Output Key',
								name: 'name',
								type: 'string',
								default: '',
								placeholder: 'text1',
								description: 'Name of the property in the output item',
							},
							{
								displayName: 'Selector (Relative to Row)',
								name: 'selector',
								type: 'string',
								default: '',
								placeholder: '.lbl-txt1',
								description: 'Searched inside the row. Leave empty to use the row element itself.',
							},
							{
								displayName: 'Extract',
								name: 'extract',
								type: 'options',
								default: 'text',
								options: extractOptions,
							},
							{
								displayName: 'Attribute Name',
								name: 'attribute',
								type: 'string',
								default: '',
								placeholder: 'href',
								displayOptions: { show: { extract: ['attr'] } },
							},
						],
					},
				],
			},

			// ---------- Shared ----------
			{
				displayName: 'Output',
				name: 'output',
				type: 'options',
				default: 'items',
				options: [
					{
						name: 'One Item per Match',
						value: 'items',
						description: 'Emit a separate item for every match (or row)',
					},
					{
						name: 'Single Item With Array',
						value: 'array',
						description: 'Emit one item containing an array of all results',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Trim Whitespace',
						name: 'trim',
						type: 'boolean',
						default: true,
					},
					{
						displayName: 'Skip Empty Values',
						name: 'skipEmpty',
						type: 'boolean',
						default: false,
						description:
							'In Single Selector mode, skip empty values. In Rows mode, skip rows where every field is empty.',
					},
					{
						displayName: 'Output Property Name',
						name: 'propertyName',
						type: 'string',
						default: 'value',
						description:
							'Key for the extracted value in Single Selector mode, or for the rows array in "Single Item With Array" output',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const html = this.getNodeParameter('html', i, '') as string;
				const mode = this.getNodeParameter('mode', i, 'single') as string;
				const output = this.getNodeParameter('output', i) as string;
				const options = this.getNodeParameter('options', i, {}) as {
					trim?: boolean;
					skipEmpty?: boolean;
					propertyName?: string;
				};
				const trim = options.trim ?? true;
				const skipEmpty = options.skipEmpty ?? false;
				const prop = options.propertyName || 'value';

				const clean = (v: string | undefined): string | undefined =>
					v === undefined ? undefined : trim ? v.trim() : v;

				const $ = cheerio.load(html, null, false); // fragment mode: no <html><body> wrapper
				const results: Array<string | IDataObject> = [];

				if (mode === 'rows') {
					const rowSelector = this.getNodeParameter('rowSelector', i) as string;
					const fieldParam = this.getNodeParameter('fields', i, {}) as { field?: FieldDef[] };
					const fields = fieldParam.field ?? [];

					if (fields.length === 0) {
						throw new NodeOperationError(this.getNode(), 'Add at least one field in Rows mode', {
							itemIndex: i,
						});
					}
					for (const f of fields) {
						if (!f.name) {
							throw new NodeOperationError(this.getNode(), 'Every field needs an Output Key', {
								itemIndex: i,
							});
						}
						if (f.extract === 'attr' && !f.attribute) {
							throw new NodeOperationError(this.getNode(), `Field "${f.name}" needs an Attribute Name`, {
								itemIndex: i,
							});
						}
					}

					try {
						$(rowSelector).each(function () {
							const row = $(this);
							const obj: IDataObject = {};
							let anyValue = false;
							for (const f of fields) {
								const target = f.selector ? row.find(f.selector).first() : row;
								let v = target.length
									? clean(extractValue($, target, f.extract, f.attribute ?? ''))
									: undefined;
								if (v === undefined) {
									obj[f.name] = null;
								} else {
									obj[f.name] = v;
									if (v !== '') anyValue = true;
								}
							}
							if (skipEmpty && !anyValue) return;
							results.push(obj);
						});
					} catch (e) {
						throw new NodeOperationError(
							this.getNode(),
							`Invalid selector: ${(e as Error).message}`,
							{ itemIndex: i },
						);
					}
				} else {
					const selector = this.getNodeParameter('selector', i) as string;
					const extract = this.getNodeParameter('extract', i) as ExtractType;
					let attribute = '';
					if (extract === 'attr') {
						attribute = this.getNodeParameter('attribute', i) as string;
						if (!attribute) {
							throw new NodeOperationError(this.getNode(), 'Attribute Name is required', {
								itemIndex: i,
							});
						}
					}

					try {
						$(selector).each(function () {
							const v = clean(extractValue($, $(this), extract, attribute));
							if (v === undefined) return; // attribute not present
							if (skipEmpty && v === '') return;
							results.push(v);
						});
					} catch (e) {
						throw new NodeOperationError(
							this.getNode(),
							`Invalid selector "${selector}": ${(e as Error).message}`,
							{ itemIndex: i },
						);
					}
				}

				if (output === 'array') {
					returnData.push({
						json: { [prop]: results, count: results.length } as IDataObject,
						pairedItem: { item: i },
					});
				} else {
					for (const r of results) {
						returnData.push({
							json: (mode === 'rows' ? r : { [prop]: r }) as IDataObject,
							pairedItem: { item: i },
						});
					}
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
