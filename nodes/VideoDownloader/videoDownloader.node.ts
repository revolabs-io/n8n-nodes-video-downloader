import { m3u8Download, fileDownload, VideoParser } from '@lzwme/m3u8-dl';
import type { M3u8DLOptions } from '@lzwme/m3u8-dl/cjs/types';

import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

export class videoDownloader implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Video Downloader',
		name: 'videoDownloader',
		icon: { light: 'file:video-downloader.svg', dark: 'file:video-downloader.dark.svg' },
		group: ['input'],
		version: 1,
		description:
			'N8N node for downloading and processing video: M3U8, MP4, Douyin, Weibo, Pipixia,...',
		defaults: {
			name: 'Video Downloader',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			// Node properties which the user gets displayed and
			// can change on the node.
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: [
					{
						name: 'Auto',
						value: 'auto',
					},
					{
						name: 'M3U8',
						value: 'm3u8',
					},
					{
						name: 'File',
						value: 'file',
					},
					{
						name: 'Parser: Douyin, Weibo, Pipixia,...',
						value: 'parser',
					},
				],
				default: 'm3u8',
				required: true,
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/path/to/playlist.m3u8',
				description: 'The URL of the M3U8 file to download',
				required: true,
			},
			{
				displayName: 'Filename',
				name: 'filename',
				type: 'string',
				default: '',
				placeholder: 'output.mp4',
				description: 'Name of the output file',
				required: true,
			},
			{
				displayName: 'Cache Directory',
				name: 'cacheDir',
				type: 'string',
				default: '',
				placeholder: '/path/to/cache',
				description: 'Temporary file save directory',
			},
			{
				displayName: 'Save Directory',
				name: 'saveDir',
				type: 'string',
				default: '',
				placeholder: '/path/to/save',
				description:
					'Output file save directory. Defaults to the same directory as the input file.',
			},
			{
				displayName: 'Send Headers',
				name: 'sendHeaders',
				type: 'boolean',
				default: false,
				description: 'Whether to send custom HTTP headers',
			},
			{
				displayName: 'Specify Headers',
				name: 'specifyHeaders',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				description: 'HTTP headers to include in requests',
				displayOptions: {
					show: {
						sendHeaders: [true],
					},
				},
				options: [
					{
						name: 'header',
						displayName: 'Header',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
								required: true,
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
								required: true,
							},
						],
					},
				],
			},
			{
				displayName: 'Overwrite Existing File',
				name: 'force',
				type: 'boolean',
				default: false,
				description:
					'Whether to force download and generate even if the file already exists. Defaults to false, skipping if the file exists.',
			},
			{
				displayName: 'Delete Cache',
				name: 'delCache',
				type: 'boolean',
				default: true,
				description: 'Whether to delete the cache after download',
			},
			{
				displayName: 'Thread Number',
				name: 'threadNum',
				type: 'number',
				default: 8,
				description:
					'Concurrent download thread count. Depends on server limitations; too many threads may lead to download failures. It is generally recommended not to exceed 8. The default is CPU count * 2, but no more than 8',
			},
			{
				displayName: 'Max Downloads',
				name: 'maxDownloads',
				type: 'number',
				default: 8,
				description: 'Maximum number of concurrent downloads',
			},
			{
				displayName: 'Ignore Segments',
				name: 'ignoreSegments',
				type: 'string',
				default: '',
				placeholder: '1,2',
				description:
					'Ignored time segments, in seconds, separated by commas. Example: 0-10,100-110.',
			},
		],
	};

	// The function below is responsible for actually doing whatever this node
	// is supposed to do. In this case, we're just appending the `myString` property
	// with whatever the user has entered.
	// You can make async calls and use `await`.
	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		let item: INodeExecutionData;

		// Iterates over all input items and add the key "myString" with the
		// value the parameter "myString" resolves to.
		// (This could be a different value for each item in case it contains an expression)
		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const url = this.getNodeParameter('url', itemIndex, '') as string;
				let type = this.getNodeParameter('type', itemIndex, 'auto') as string;
				if (type === 'auto') {
					// Auto-detect type based on URL extension
					if (url.toLowerCase().endsWith('.m3u8')) {
						type = 'm3u8';
					} else if (/\.(mp4|mkv|mov|avi|wmv|flv|webm|m4v)$/i.test(url)) {
						type = 'file';
					} else {
						type = 'parser';
					}
				}

				const delCache = this.getNodeParameter('delCache', itemIndex, true) as boolean;
				const cacheDir = this.getNodeParameter('cacheDir', itemIndex, '') as string;
				const saveDir = this.getNodeParameter('saveDir', itemIndex, '') as string;
				const sendHeaders = this.getNodeParameter('sendHeaders', itemIndex, false) as boolean;
				const headersRaw = sendHeaders
					? (this.getNodeParameter('specifyHeaders', itemIndex, {}) as {
							header?: Array<{ name: string; value: string }>;
						})
					: {};
				const headers = headersRaw.header
					? headersRaw.header.reduce(
							(acc, h) => {
								acc[h.name] = h.value;
								return acc;
							},
							{} as Record<string, string>,
						)
					: {};
				const threadNum = this.getNodeParameter('threadNum', itemIndex, 8) as number;
				const maxDownloads = this.getNodeParameter('maxDownloads', itemIndex, 8) as number;
				const ignoreSegments = this.getNodeParameter('ignoreSegments', itemIndex, '') as string;
				const filename = this.getNodeParameter('filename', itemIndex, '') as string;
				const force = this.getNodeParameter('force', itemIndex, true) as boolean;
				item = items[itemIndex];

				const downloadOptions: M3u8DLOptions = {
					delCache: delCache || false,
					cacheDir: cacheDir || undefined,
					saveDir: saveDir || undefined,
					headers: headers || undefined,
					threadNum: threadNum || undefined,
					maxDownloads: maxDownloads || undefined,
					ignoreSegments: ignoreSegments || undefined,
					filename: filename || undefined,
					force: force || false,
					showProgress: true,
					debug: false,
				};

				Object.keys(downloadOptions).forEach((key) => {
					if (downloadOptions[key as keyof M3u8DLOptions] === undefined) {
						delete downloadOptions[key as keyof M3u8DLOptions];
					}
				});

				let result;

				if (type === 'm3u8') {
					result = await m3u8Download(url, downloadOptions);
				} else if (type === 'file') {
					result = await fileDownload(url, downloadOptions);
				} else {
					const vp = new VideoParser();
					result = await vp.download(url, downloadOptions);
				}

				if (!result.filepath) {
					throw new NodeOperationError(this.getNode(), result.errmsg || 'Download failed', {
						itemIndex,
					});
				}

				item.json.data = result;
			} catch (error) {
				// This node should never fail but we want to showcase how
				// to handle errors.
				if (this.continueOnFail()) {
					items.push({ json: this.getInputData(itemIndex)[0].json, error, pairedItem: itemIndex });
				} else {
					// Adding `itemIndex` allows other workflows to handle this error
					if (error.context) {
						// If the error thrown already contains the context property,
						// only append the itemIndex
						error.context.itemIndex = itemIndex;
						throw error;
					}
					throw new NodeOperationError(this.getNode(), error, {
						itemIndex,
					});
				}
			}
		}

		return [items];
	}
}
