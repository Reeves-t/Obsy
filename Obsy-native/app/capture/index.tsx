import { CameraView, CameraType, useCameraPermissions, FlashMode } from 'expo-camera';
import { useState, useRef, useCallback } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { ScreenWrapper } from '@/components/ScreenWrapper';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
    useSharedValue,
    useAnimatedStyle,
    withSpring,
    withTiming,
    interpolate,
    runOnJS,
} from 'react-native-reanimated';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// BeReal-style 3:4 aspect ratio - fills more of the screen
const FRAME_ASPECT_RATIO = 3 / 4;
const FRAME_WIDTH = SCREEN_WIDTH; // Full width
const FRAME_HEIGHT = FRAME_WIDTH / FRAME_ASPECT_RATIO; // Taller than wide
const FRAME_BORDER_RADIUS = 12;

// Zoom configuration
const MIN_ZOOM = 0; // 0.5x ultrawide mapped to expo-camera 0
const MAX_ZOOM = 0.65; // ~3x
const DEFAULT_ZOOM = 0.15; // 1x

// Zoom level mappings for pills and display
const ZOOM_PRESETS = [
    { label: '.5x', value: 0, displayScale: 0.5 },
    { label: '1x', value: 0.15, displayScale: 1 },
    { label: '2x', value: 0.35, displayScale: 2 },
    { label: '3x', value: 0.65, displayScale: 3 },
];

// Flash mode cycle
const FLASH_MODES: FlashMode[] = ['off', 'on', 'auto'];

// Center indicator config
const CENTER_INDICATOR_BASE_SIZE = 40;
const CENTER_INDICATOR_MIN_SIZE = 24;
const CENTER_INDICATOR_MAX_SIZE = 60;

export default function CaptureScreen() {
    const [facing, setFacing] = useState<CameraType>('back');
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const router = useRouter();
    const params = useLocalSearchParams();
    const [isTakingPicture, setIsTakingPicture] = useState(false);
    const [flashMode, setFlashMode] = useState<FlashMode>('off');

    // Zoom state - need both shared value (for animations) and state (for camera prop)
    const zoomAnimated = useSharedValue(DEFAULT_ZOOM);
    const savedZoom = useSharedValue(DEFAULT_ZOOM);
    const [zoom, setZoom] = useState(DEFAULT_ZOOM);
    const [displayZoom, setDisplayZoom] = useState(1);
    const [selectedPresetIndex, setSelectedPresetIndex] = useState(1); // Default to 1x

    // Update display zoom, camera zoom, and preset highlight
    const updateZoomState = useCallback((zoomValue: number) => {
        // Update camera zoom
        setZoom(zoomValue);

        // Map zoom value to display scale (0.5x - 3x)
        const scale = interpolateZoomToScale(zoomValue);
        setDisplayZoom(Math.round(scale * 10) / 10);

        // Find closest preset
        let closestIndex = 0;
        let closestDiff = Math.abs(zoomValue - ZOOM_PRESETS[0].value);
        ZOOM_PRESETS.forEach((preset, index) => {
            const diff = Math.abs(zoomValue - preset.value);
            if (diff < closestDiff) {
                closestDiff = diff;
                closestIndex = index;
            }
        });
        setSelectedPresetIndex(closestIndex);
    }, []);

    // Map expo-camera zoom (0-1) to display scale (0.5-3)
    const interpolateZoomToScale = (zoomValue: number): number => {
        if (zoomValue <= 0.15) {
            // 0 -> 0.5x, 0.15 -> 1x
            return 0.5 + (zoomValue / 0.15) * 0.5;
        } else if (zoomValue <= 0.35) {
            // 0.15 -> 1x, 0.35 -> 2x
            return 1 + ((zoomValue - 0.15) / 0.2) * 1;
        } else {
            // 0.35 -> 2x, 0.65 -> 3x
            return 2 + ((zoomValue - 0.35) / 0.3) * 1;
        }
    };

    // Pinch gesture handler
    const pinchGesture = Gesture.Pinch()
        .onStart(() => {
            savedZoom.value = zoomAnimated.value;
        })
        .onUpdate((event) => {
            // Scale factor: pinch in (< 1) zooms out, pinch out (> 1) zooms in
            const scaleDelta = event.scale;

            // Apply logarithmic scaling for smoother control
            const zoomDelta = (scaleDelta - 1) * 0.5;
            let newZoom = savedZoom.value + zoomDelta;

            // Clamp to valid range
            newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
            zoomAnimated.value = newZoom;

            runOnJS(updateZoomState)(newZoom);
        })
        .onEnd(() => {
            savedZoom.value = zoomAnimated.value;
        });

    // Center indicator animated style
    const centerIndicatorStyle = useAnimatedStyle(() => {
        // Inverse relationship: more zoom = smaller circle (narrower FOV)
        const size = interpolate(
            zoomAnimated.value,
            [MIN_ZOOM, DEFAULT_ZOOM, MAX_ZOOM],
            [CENTER_INDICATOR_MAX_SIZE, CENTER_INDICATOR_BASE_SIZE, CENTER_INDICATOR_MIN_SIZE]
        );

        return {
            width: size,
            height: size,
            borderRadius: size / 2,
            opacity: withTiming(zoomAnimated.value !== DEFAULT_ZOOM ? 0.6 : 0.3, { duration: 200 }),
        };
    });

    if (!permission) {
        return <View style={styles.container} />;
    }

    if (!permission.granted) {
        return (
            <ScreenWrapper style={styles.container}>
                <View style={styles.permissionContainer}>
                    <Text style={styles.message}>We need your permission to show the camera</Text>
                    <Button onPress={requestPermission} title="grant permission" />
                </View>
            </ScreenWrapper>
        );
    }

    function toggleCameraFacing() {
        setFacing(current => (current === 'back' ? 'front' : 'back'));
    }

    function handleZoomPreset(index: number) {
        const preset = ZOOM_PRESETS[index];
        zoomAnimated.value = withSpring(preset.value, { damping: 15, stiffness: 150 });
        savedZoom.value = preset.value;
        setZoom(preset.value); // Update camera zoom
        setSelectedPresetIndex(index);
        setDisplayZoom(preset.displayScale);
    }

    function toggleFlash() {
        const currentIndex = FLASH_MODES.indexOf(flashMode);
        const nextIndex = (currentIndex + 1) % FLASH_MODES.length;
        setFlashMode(FLASH_MODES[nextIndex]);
    }

    function getFlashIcon(): keyof typeof Ionicons.glyphMap {
        switch (flashMode) {
            case 'on': return 'flash';
            case 'auto': return 'flash-outline';
            default: return 'flash-off-outline';
        }
    }

    async function takePicture() {
        if (cameraRef.current && !isTakingPicture) {
            setIsTakingPicture(true);
            try {
                const photo = await cameraRef.current.takePictureAsync({
                    quality: 0.8,
                    skipProcessing: true,
                });

                if (photo) {
                    router.push({
                        pathname: '/capture/review',
                        params: {
                            imageUri: photo.uri,
                            imageWidth: photo.width?.toString(),
                            imageHeight: photo.height?.toString(),
                            cropToSquare: 'false', // Keep 3:4 ratio
                            targetAspectRatio: '3:4',
                            ...params
                        }
                    });
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsTakingPicture(false);
            }
        }
    }

    // Calculate vertical positioning to center the frame
    const topBarHeight = 100; // Space for top controls
    const bottomControlsHeight = 180; // Space for bottom controls
    const availableHeight = SCREEN_HEIGHT - topBarHeight - bottomControlsHeight;
    const frameTop = topBarHeight + (availableHeight - FRAME_HEIGHT) / 2;

    return (
        <GestureHandlerRootView style={styles.container}>
            <View style={styles.container}>
                {/* Top Bar - positioned absolutely */}
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.iconButton}>
                        <Ionicons name="close" size={26} color="white" />
                    </TouchableOpacity>

                    <View style={{ flex: 1 }} />

                    {/* Flash Button */}
                    <TouchableOpacity
                        onPress={toggleFlash}
                        style={[
                            styles.iconButton,
                            flashMode === 'on' && styles.flashActive
                        ]}
                    >
                        <Ionicons name={getFlashIcon()} size={22} color="white" />
                    </TouchableOpacity>
                </View>

                {/* Camera Preview with Gesture Handler */}
                <GestureDetector gesture={pinchGesture}>
                    <View style={[styles.cameraContainer, { top: frameTop }]}>
                        <CameraView
                            style={styles.camera}
                            facing={facing}
                            ref={cameraRef}
                            zoom={zoom.value}
                            flash={flashMode}
                        >
                            {/* Subtle corner accents */}
                            <View style={[styles.cornerAccent, styles.cornerTL]} />
                            <View style={[styles.cornerAccent, styles.cornerTR]} />
                            <View style={[styles.cornerAccent, styles.cornerBL]} />
                            <View style={[styles.cornerAccent, styles.cornerBR]} />

                            {/* Center zoom indicator */}
                            <View style={styles.centerIndicatorContainer}>
                                <Animated.View style={[styles.centerIndicator, centerIndicatorStyle]} />
                            </View>
                        </CameraView>
                    </View>
                </GestureDetector>

                {/* Bottom Controls */}
                <View style={styles.bottomControls}>
                    {/* Zoom display */}
                    <Text style={styles.zoomDisplayText}>{displayZoom}x</Text>

                    {/* Zoom Pills */}
                    <View style={styles.zoomPillsContainer}>
                        {ZOOM_PRESETS.map((preset, index) => (
                            <TouchableOpacity
                                key={preset.label}
                                onPress={() => handleZoomPreset(index)}
                                style={[
                                    styles.zoomPill,
                                    selectedPresetIndex === index && styles.zoomPillSelected
                                ]}
                            >
                                <Text style={[
                                    styles.zoomPillText,
                                    selectedPresetIndex === index && styles.zoomPillTextSelected
                                ]}>
                                    {preset.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {/* Shutter Row */}
                    <View style={styles.shutterRow}>
                        <TouchableOpacity style={styles.iconButton} onPress={toggleCameraFacing}>
                            <Ionicons name="camera-reverse-outline" size={26} color="white" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.captureButton, isTakingPicture && styles.captureButtonActive]}
                            onPress={takePicture}
                            disabled={isTakingPicture}
                        >
                            <View style={styles.captureButtonInner} />
                        </TouchableOpacity>

                        <View style={styles.spacer} />
                    </View>
                </View>
            </View>
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    permissionContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    message: {
        textAlign: 'center',
        paddingBottom: 10,
        color: 'white',
    },

    // Top bar
    topBar: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 100,
        paddingTop: 50,
        paddingHorizontal: 20,
        flexDirection: 'row',
        alignItems: 'center',
        zIndex: 10,
    },

    // Camera container - 3:4 aspect ratio
    cameraContainer: {
        position: 'absolute',
        left: 0,
        width: FRAME_WIDTH,
        height: FRAME_HEIGHT,
        borderRadius: FRAME_BORDER_RADIUS,
        overflow: 'hidden',
    },
    camera: {
        flex: 1,
    },

    // Corner accents for premium feel
    cornerAccent: {
        position: 'absolute',
        width: 28,
        height: 28,
        borderColor: 'rgba(255,255,255,0.5)',
    },
    cornerTL: {
        top: 8,
        left: 8,
        borderTopWidth: 2,
        borderLeftWidth: 2,
        borderTopLeftRadius: 8,
    },
    cornerTR: {
        top: 8,
        right: 8,
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderTopRightRadius: 8,
    },
    cornerBL: {
        bottom: 8,
        left: 8,
        borderBottomWidth: 2,
        borderLeftWidth: 2,
        borderBottomLeftRadius: 8,
    },
    cornerBR: {
        bottom: 8,
        right: 8,
        borderBottomWidth: 2,
        borderRightWidth: 2,
        borderBottomRightRadius: 8,
    },

    // Center zoom indicator
    centerIndicatorContainer: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    centerIndicator: {
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
        backgroundColor: 'transparent',
    },

    // Controls
    iconButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(255,255,255,0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    flashActive: {
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.4)',
    },

    // Bottom controls
    bottomControls: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 180,
        paddingBottom: 36,
        paddingHorizontal: 20,
        gap: 16,
        justifyContent: 'flex-end',
    },

    // Zoom display
    zoomDisplayText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '500',
        textAlign: 'center',
        letterSpacing: 0.5,
    },

    // Zoom pills
    zoomPillsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    zoomPill: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    zoomPillSelected: {
        backgroundColor: 'rgba(255,255,255,0.25)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
    },
    zoomPillText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 13,
        fontWeight: '600',
    },
    zoomPillTextSelected: {
        color: 'white',
    },

    // Shutter row
    shutterRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
    },
    captureButton: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: 'rgba(255,255,255,0.25)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.4)',
    },
    captureButtonActive: {
        opacity: 0.6,
    },
    captureButtonInner: {
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: 'white',
    },
    spacer: {
        width: 44,
    },
});
