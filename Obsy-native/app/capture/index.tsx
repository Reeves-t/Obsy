import { CameraView, CameraType, useCameraPermissions, FlashMode } from 'expo-camera';
import { useState, useRef } from 'react';
import { Button, StyleSheet, Text, TouchableOpacity, View, Dimensions } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Colors from '@/constants/Colors';
import { ScreenWrapper } from '@/components/ScreenWrapper';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
// Responsive frame size: 82% of screen width, max 420
const FRAME_SIZE = Math.min(SCREEN_WIDTH * 0.82, 420);
const FRAME_BORDER_RADIUS = 20;

// Zoom level mappings (expo-camera zoom is 0-1)
const ZOOM_LEVELS = [
    { label: '1x', value: 0 },
    { label: '2x', value: 0.35 },
    { label: '3x', value: 0.65 },
];

// Flash mode cycle
const FLASH_MODES: FlashMode[] = ['off', 'on', 'auto'];

export default function CaptureScreen() {
    const [facing, setFacing] = useState<CameraType>('back');
    const [permission, requestPermission] = useCameraPermissions();
    const cameraRef = useRef<CameraView>(null);
    const router = useRouter();
    const params = useLocalSearchParams();
    const [isTakingPicture, setIsTakingPicture] = useState(false);
    const [zoom, setZoom] = useState(0);
    const [selectedZoomIndex, setSelectedZoomIndex] = useState(0);
    const [flashMode, setFlashMode] = useState<FlashMode>('off');

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

    function handleZoomSelect(index: number) {
        setSelectedZoomIndex(index);
        setZoom(ZOOM_LEVELS[index].value);
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
                            cropToSquare: 'true',
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

    // Calculate mask heights for centering the frame
    const verticalMaskHeight = (SCREEN_HEIGHT - FRAME_SIZE) / 2;
    const horizontalMaskWidth = (SCREEN_WIDTH - FRAME_SIZE) / 2;

    return (
        <View style={styles.container}>
            <CameraView
                style={styles.camera}
                facing={facing}
                ref={cameraRef}
                zoom={zoom}
                flash={flashMode}
            >
                {/* Black Mask Overlay - Solid black outside square */}
                <View style={styles.maskOverlay} pointerEvents="none">
                    {/* Top mask */}
                    <View style={[styles.mask, { height: verticalMaskHeight }]} />

                    {/* Middle row */}
                    <View style={styles.middleRow}>
                        {/* Left mask */}
                        <View style={[styles.mask, { width: horizontalMaskWidth }]} />

                        {/* Square frame (transparent with border) */}
                        <View style={styles.frame}>
                            {/* Subtle corner accents */}
                            <View style={[styles.cornerAccent, styles.cornerTL]} />
                            <View style={[styles.cornerAccent, styles.cornerTR]} />
                            <View style={[styles.cornerAccent, styles.cornerBL]} />
                            <View style={[styles.cornerAccent, styles.cornerBR]} />
                        </View>

                        {/* Right mask */}
                        <View style={[styles.mask, { width: horizontalMaskWidth }]} />
                    </View>

                    {/* Bottom mask */}
                    <View style={[styles.mask, { height: verticalMaskHeight }]} />
                </View>

                {/* Controls Layer */}
                <View style={styles.controlsLayer}>
                    {/* Top Bar */}
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

                    {/* Bottom Controls */}
                    <View style={styles.bottomControls}>
                        {/* Zoom Pills */}
                        <View style={styles.zoomPillsContainer}>
                            {ZOOM_LEVELS.map((level, index) => (
                                <TouchableOpacity
                                    key={level.label}
                                    onPress={() => handleZoomSelect(index)}
                                    style={[
                                        styles.zoomPill,
                                        selectedZoomIndex === index && styles.zoomPillSelected
                                    ]}
                                >
                                    <Text style={[
                                        styles.zoomPillText,
                                        selectedZoomIndex === index && styles.zoomPillTextSelected
                                    ]}>
                                        {level.label}
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
            </CameraView>
        </View>
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
    camera: {
        flex: 1,
    },
    // Black mask overlay
    maskOverlay: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1,
    },
    mask: {
        backgroundColor: 'black', // Solid black
    },
    middleRow: {
        flexDirection: 'row',
        height: FRAME_SIZE,
    },
    // Square frame with subtle border
    frame: {
        width: FRAME_SIZE,
        height: FRAME_SIZE,
        borderRadius: FRAME_BORDER_RADIUS,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.25)',
        backgroundColor: 'transparent',
    },
    // Corner accents for premium feel
    cornerAccent: {
        position: 'absolute',
        width: 24,
        height: 24,
        borderColor: 'rgba(255,255,255,0.6)',
    },
    cornerTL: {
        top: -1,
        left: -1,
        borderTopWidth: 2.5,
        borderLeftWidth: 2.5,
        borderTopLeftRadius: FRAME_BORDER_RADIUS,
    },
    cornerTR: {
        top: -1,
        right: -1,
        borderTopWidth: 2.5,
        borderRightWidth: 2.5,
        borderTopRightRadius: FRAME_BORDER_RADIUS,
    },
    cornerBL: {
        bottom: -1,
        left: -1,
        borderBottomWidth: 2.5,
        borderLeftWidth: 2.5,
        borderBottomLeftRadius: FRAME_BORDER_RADIUS,
    },
    cornerBR: {
        bottom: -1,
        right: -1,
        borderBottomWidth: 2.5,
        borderRightWidth: 2.5,
        borderBottomRightRadius: FRAME_BORDER_RADIUS,
    },
    // Controls layer
    controlsLayer: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 2,
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: 60,
        paddingBottom: 36,
    },
    topBar: {
        flexDirection: 'row',
        alignItems: 'center',
    },
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
        gap: 20,
    },
    // Zoom pills
    zoomPillsContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    zoomPill: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    zoomPillSelected: {
        backgroundColor: 'rgba(255,255,255,0.25)',
    },
    zoomPillText: {
        color: 'rgba(255,255,255,0.85)',
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
