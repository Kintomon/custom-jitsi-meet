import React from 'react';
import { connect } from 'react-redux';
import Hls from 'hls.js';

import { PLAYBACK_STATUSES } from '../../constants';
import AbstractVideoManager, {
    IProps,
    _mapDispatchToProps,
    _mapStateToProps
} from './AbstractVideoManager';

class VideoManager extends AbstractVideoManager {
    playerRef: React.RefObject<HTMLVideoElement>;
    _hls?: Hls;
    _lastUrl?: string;

    constructor(props: IProps) {
        super(props);
        this.playerRef = React.createRef();
    }

    get player() {
        return this.playerRef.current;
    }

    /** ---------- lifecycle ---------- */

    override componentDidMount() {
        this._setupSource(this.props.videoId);
    }

    override componentDidUpdate(prevProps: IProps) {
        if (prevProps.videoId !== this.props.videoId) {
            this._setupSource(this.props.videoId);
        }
        if (prevProps._time !== this.props._time) {
            this.seek(this.props._time || 0)
        }
        if (prevProps._status !== this.props._status) {
            if (this.props._status === "pause") this.pause(); else this.play();
        }
        if (prevProps._muted !== this.props._muted) {
            if (this.props._muted) this.mute(); else this.unMute();
        }
    }

    override componentWillUnmount() {
        this._destroyHls();
    }

    /** ---------- source / hls setup ---------- */

    _isHls(url?: string) {
        return typeof url === 'string' && /(\.m3u8)(\?|#|$)/i.test(url);
    }

    _destroyHls() {
        try {
            this._hls?.destroy();
        } catch { }
        this._hls = undefined;
    }

    _setupSource(url?: string) {
        console.log(url)
        const video = this.player;
        if (!video || !url || url === this._lastUrl) return;
        this._lastUrl = url;

        // Always clear previous bindings
        this._destroyHls();
        try {
            // Stop current playback and clear <video> src to release old resource
            video.pause();
            video.removeAttribute('src');
            video.load();
        } catch { }

        if (this._isHls(url)) {
            // Prefer hls.js where supported; fall back to Safari native HLS
            if (Hls.isSupported()) {
                const hls = new Hls({
                    enableWorker: true,
                    lowLatencyMode: true
                });
                this._hls = hls;

                hls.on(Hls.Events.ERROR, (_evt, data) => {
                    // fatal network or media error => bubble to existing onError()
                    if (data?.fatal) {
                        this.onError();
                    }
                });

                hls.loadSource(url);
                hls.attachMedia(video);
                // autoplay if owner requested autoPlay
                video.play().catch(() => {/* ignore autoplay issues */ });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // Safari (iOS/macOS) native HLS
                video.src = url;
                video.play().catch(() => {/* ignore autoplay issues */ });
            } else {
                // No HLS support at all
                this.onError();
            }
        } else {
            // Non-HLS: simple direct source
            video.src = url;
            video.play().catch(() => {/* ignore autoplay issues */ });
        }
    }

    /** ---------- status / controls ---------- */

    override getPlaybackStatus() {
        if (!this.player) return;
        return this.player.paused ? PLAYBACK_STATUSES.PAUSED : PLAYBACK_STATUSES.PLAYING;
    }

    override isMuted() {
        return this.player?.muted;
    }

    override getVolume() {
        return Number(this.player?.volume);
    }

    override getTime() {
        return Number(this.player?.currentTime);
    }

    override getDuration() {
        return Number(this.player?.duration);
    }

    override seek(time: number) {
        if (this.player) {
            this.player.currentTime = time;
        }
    }

    override play() {
        return this.player?.play();
    }

    override pause() {
        return this.player?.pause();
    }

    override mute() {
        if (this.player) this.player.muted = true;
    }

    override unMute() {
        if (this.player) this.player.muted = false;
    }

    /** ---------- video element props ---------- */

    getPlayerOptions() {
        const { _isOwner } = this.props;

        // NOTE: we DO NOT set `src` here; _setupSource handles it (so HLS works).
        // We still wire all the callbacks you already use.
        let options: any = {
            autoPlay: true,
            // playsInline avoids iOS fullscreen hijack
            // playsInline: true,
            controls: _isOwner,
            onError: () => this.onError(),
            onPlay: () => this.onPlay(),
            onVolumeChange: () => this.onVolumeChange(),
            onEnded: () => this.onPause() // ended -> treated like pause in your manager
        };

        if (_isOwner) {
            options = {
                ...options,
                onPause: () => this.onPause(),
                onTimeUpdate: this.throttledFireUpdateSharedVideoEvent
            };
        }

        return options;
    }

    /** ---------- render ---------- */

    override render() {
        return (
            <video
                id='sharedVideoPlayer'
                ref={this.playerRef}
                {...this.getPlayerOptions()}
            />
        );
    }
}

export default connect(_mapStateToProps, _mapDispatchToProps)(VideoManager);
