/* eslint-disable react-hooks/rules-of-hooks */
import { ReactElement, useEffect } from 'react'
import {
	BaseBoxShapeUtil,
	DefaultSpinner,
	HTMLContainer,
	SvgExportContext,
	TLBaseShape,
	TldrawUiIcon,
	Vec,
	toDomPrecision,
	useIsEditing,
	useValue,
} from 'tldraw'
import { Dropdown } from '../components/Dropdown'
import { LINK_HOST, PROTOCOL } from '../lib/hosts'
import { uploadLink } from '../lib/uploadLink'

export type PreviewShape = TLBaseShape<
	'preview',
	{
		html: string
		source: string
		w: number
		h: number
		linkUploadVersion?: number
		uploadedShapeId?: string
		dateCreated?: number
	}
>

export class PreviewShapeUtil extends BaseBoxShapeUtil<PreviewShape> {
	static override type = 'preview' as const

	getDefaultProps(): PreviewShape['props'] {
		return {
			html: '',
			source: '',
			w: (960 * 2) / 3,
			h: (540 * 2) / 3,
			dateCreated: Date.now(),
		}
	}

	override canEdit = () => true
	override isAspectRatioLocked = (_shape: PreviewShape) => false
	override canResize = (_shape: PreviewShape) => true

	override component(shape: PreviewShape) {
		const isEditing = useIsEditing(shape.id)

		const boxShadow = useValue(
			'box shadow',
			() => {
				const rotation = this.editor.getShapePageTransform(shape)!.rotation()
				return getRotatedBoxShadow(rotation)
			},
			[this.editor]
		)

		const { html, linkUploadVersion, uploadedShapeId } = shape.props

		const isOnlySelected = useValue(
			'is only selected',
			() => this.editor.getOnlySelectedShapeId() === shape.id,
			[shape.id, this.editor]
		)

		// upload the html if we haven't already:
		useEffect(() => {
			let isCancelled = false
			if (html && (linkUploadVersion === undefined || uploadedShapeId !== shape.id)) {
				;(async () => {
					await uploadLink(shape.id, html)
					if (isCancelled) return

					this.editor.updateShape<PreviewShape>({
						id: shape.id,
						type: 'preview',
						props: {
							linkUploadVersion: 1,
							uploadedShapeId: shape.id,
						},
					})
				})()
			}
			return () => {
				isCancelled = true
			}
		}, [shape.id, html, linkUploadVersion, uploadedShapeId])

		const isLoading = linkUploadVersion === undefined || uploadedShapeId !== shape.id

		const uploadUrl = [PROTOCOL, LINK_HOST, '/', shape.id.replace(/^shape:/, '')].join('')

		return (
			<HTMLContainer className="tl-embed-container" id={shape.id}>
				{isLoading ? (
					<div
						style={{
							width: '100%',
							height: '100%',
							backgroundColor: 'var(--color-culled)',
							display: 'flex',
							alignItems: 'center',
							justifyContent: 'center',
							boxShadow,
							border: '1px solid var(--color-panel-contrast)',
							borderRadius: 'var(--radius-2)',
						}}
					>
						<DefaultSpinner />
					</div>
				) : (
					<>
						<iframe
							id={`iframe-1-${shape.id}`}
							src={`${uploadUrl}?preview=1&v=${linkUploadVersion}`}
							width={toDomPrecision(shape.props.w)}
							height={toDomPrecision(shape.props.h)}
							draggable={false}
							style={{
								backgroundColor: 'var(--color-panel)',
								pointerEvents: isEditing ? 'auto' : 'none',
								boxShadow,
								border: '1px solid var(--color-panel-contrast)',
								borderRadius: 'var(--radius-2)',
							}}
						/>
						{isOnlySelected && (
							<div
								style={{
									all: 'unset',
									position: 'absolute',
									top: -3,
									right: -45,
									height: 40,
									width: 40,
									display: 'flex',
									alignItems: 'center',
									justifyContent: 'center',
									cursor: 'pointer',
									pointerEvents: 'all',
								}}
							>
								<Dropdown boxShadow={boxShadow} html={shape.props.html} uploadUrl={uploadUrl}>
									<button className="bg-white rounded p-2" style={{ boxShadow }}>
										<TldrawUiIcon icon="dots-vertical" />
									</button>
								</Dropdown>
							</div>
						)}
						<div
							style={{
								textAlign: 'center',
								position: 'absolute',
								bottom: isEditing ? -40 : 0,
								padding: 4,
								fontFamily: 'inherit',
								fontSize: 12,
								left: 0,
								width: '100%',
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								pointerEvents: 'none',
							}}
						>
							<span
								style={{
									background: 'var(--color-panel)',
									padding: '4px 12px',
									borderRadius: 99,
									border: '1px solid var(--color-muted-1)',
								}}
							>
								{isEditing ? 'Click the canvas to exit' : 'Double click to interact'}
							</span>
						</div>
					</>
				)}
			</HTMLContainer>
		)
	}

	override toSvg(shape: PreviewShape, _ctx: SvgExportContext) {
		// while screenshot is the same as the old one, keep waiting for a new one
		return new Promise<ReactElement>((resolve, reject) => {
			if (window === undefined) {
				reject()
				return
			}

			const windowListener = (event: MessageEvent) => {
				if (event.data.screenshot && event.data?.shapeid === shape.id) {
					window.removeEventListener('message', windowListener)
					clearTimeout(timeOut)

					resolve(<PreviewImage href={event.data.screenshot} shape={shape} />)
				}
			}
			const timeOut = setTimeout(() => {
				reject()
				window.removeEventListener('message', windowListener)
			}, 2000)
			window.addEventListener('message', windowListener)
			//request new screenshot
			const firstLevelIframe = document.getElementById(`iframe-1-${shape.id}`) as HTMLIFrameElement
			if (firstLevelIframe) {
				firstLevelIframe.contentWindow.postMessage(
					{ action: 'take-screenshot', shapeid: shape.id },
					'*'
				)
			} else {
				console.log('first level iframe not found or not accessible')
			}
		})
	}

	indicator(shape: PreviewShape) {
		return <rect width={shape.props.w} height={shape.props.h} />
	}
}

// todo: export these from tldraw

const ROTATING_BOX_SHADOWS = [
	{
		offsetX: 0,
		offsetY: 2,
		blur: 4,
		spread: -1,
		color: '#0000003a',
	},
	{
		offsetX: 0,
		offsetY: 3,
		blur: 12,
		spread: -2,
		color: '#0000001f',
	},
]

function getRotatedBoxShadow(rotation: number) {
	const cssStrings = ROTATING_BOX_SHADOWS.map((shadow) => {
		const { offsetX, offsetY, blur, spread, color } = shadow
		const vec = new Vec(offsetX, offsetY)
		const { x, y } = vec.rot(-rotation)
		return `${x}px ${y}px ${blur}px ${spread}px ${color}`
	})
	return cssStrings.join(', ')
}

function PreviewImage({ shape, href }: { shape: PreviewShape; href: string }) {
	return <image href={href} width={shape.props.w.toString()} height={shape.props.h.toString()} />
}
