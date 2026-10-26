const WASM_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'
const FILLER_PATTERN = /\b(?:um+|uh+|erm+|you know|sort of|kind of|basically|actually)\b/gi

function average(values) {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0
}

function standardDeviation(values) {
  if (values.length < 2) return 0
  const mean = average(values)
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)))
}

function visible(landmark) {
  return landmark && (landmark.visibility ?? 1) >= 0.5
}

export function buildDeliveryMetrics(baseMetrics, transcript) {
  const words = transcript.trim().match(/[\p{L}\p{N}']+/gu) || []
  const fillers = transcript.match(FILLER_PATTERN) || []
  const duration = Math.max(1, Math.min(300, baseMetrics?.duration_seconds || 1))

  return {
    duration_seconds: Math.round(duration * 10) / 10,
    word_count: words.length,
    words_per_minute: Math.min(500, Math.round((words.length / duration) * 600) / 10),
    filler_word_count: fillers.length,
    long_pause_count: baseMetrics?.long_pause_count || 0,
    speech_ratio: Math.max(0, Math.min(1, baseMetrics?.speech_ratio || 0)),
    pose_analysis_available: Boolean(baseMetrics?.pose_analysis_available),
    pose_detection_rate: baseMetrics?.pose_detection_rate ?? null,
    centered_rate: baseMetrics?.centered_rate ?? null,
    posture_stability: baseMetrics?.posture_stability ?? null,
    gesture_activity: baseMetrics?.gesture_activity ?? null,
  }
}

export async function createInterviewDeliveryAnalyzer(video, stream, onStatus) {
  const AudioContext = window.AudioContext || window.webkitAudioContext
  let audioContext = null
  let analyser = null
  let audioSamples = null
  let poseLandmarker = null

  if (AudioContext) {
    audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(stream)
    analyser = audioContext.createAnalyser()
    analyser.fftSize = 1024
    analyser.smoothingTimeConstant = 0.35
    source.connect(analyser)
    audioSamples = new Float32Array(analyser.fftSize)
  }

  onStatus?.('loading')
  try {
    const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision')
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT)
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: POSE_MODEL },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.55,
      minPosePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    })
    onStatus?.('ready')
  } catch {
    onStatus?.('limited')
  }

  let animationFrame = 0
  let startedAt = 0
  let lastAudioSample = 0
  let lastPoseSample = 0
  let speakingSamples = 0
  let totalAudioSamples = 0
  let silenceStartedAt = null
  let hasSpoken = false
  let longPauseCount = 0
  let poseFrames = 0
  let detectedPoseFrames = 0
  let centeredFrames = 0
  let wristMovement = 0
  let wristSamples = 0
  let previousWrists = null
  let shoulderTilts = []
  let bodyCenters = []

  function reset() {
    startedAt = performance.now()
    lastAudioSample = 0
    lastPoseSample = 0
    speakingSamples = 0
    totalAudioSamples = 0
    silenceStartedAt = null
    hasSpoken = false
    longPauseCount = 0
    poseFrames = 0
    detectedPoseFrames = 0
    centeredFrames = 0
    wristMovement = 0
    wristSamples = 0
    previousWrists = null
    shoulderTilts = []
    bodyCenters = []
  }

  function sampleAudio(now) {
    if (!analyser || !audioSamples || now - lastAudioSample < 100) return
    lastAudioSample = now
    analyser.getFloatTimeDomainData(audioSamples)
    const rms = Math.sqrt(average(Array.from(audioSamples, (value) => value * value)))
    const speaking = rms >= 0.025
    totalAudioSamples += 1

    if (speaking) {
      speakingSamples += 1
      if (hasSpoken && silenceStartedAt && now - silenceStartedAt >= 1200) longPauseCount += 1
      hasSpoken = true
      silenceStartedAt = null
    } else if (hasSpoken && silenceStartedAt == null) {
      silenceStartedAt = now
    }
  }

  function samplePose(now) {
    if (!poseLandmarker || video.readyState < 2 || now - lastPoseSample < 250) return
    lastPoseSample = now
    poseFrames += 1

    let landmarks
    try {
      landmarks = poseLandmarker.detectForVideo(video, now).landmarks?.[0]
    } catch {
      return
    }
    if (!landmarks) return

    const leftShoulder = landmarks[11]
    const rightShoulder = landmarks[12]
    const nose = landmarks[0]
    if (!visible(leftShoulder) || !visible(rightShoulder) || !visible(nose)) return

    detectedPoseFrames += 1
    const shoulderCenter = (leftShoulder.x + rightShoulder.x) / 2
    const shoulderWidth = Math.max(Math.abs(leftShoulder.x - rightShoulder.x), 0.08)
    bodyCenters.push(shoulderCenter)
    shoulderTilts.push(Math.abs(leftShoulder.y - rightShoulder.y) / shoulderWidth)
    if (shoulderCenter >= 0.32 && shoulderCenter <= 0.68 && nose.y >= 0.08 && nose.y <= 0.48) {
      centeredFrames += 1
    }

    const leftWrist = landmarks[15]
    const rightWrist = landmarks[16]
    if (!visible(leftWrist) || !visible(rightWrist)) return
    const wrists = [leftWrist.x, leftWrist.y, rightWrist.x, rightWrist.y]
    if (previousWrists) {
      const movement = wrists.reduce((total, value, index) => total + Math.abs(value - previousWrists[index]), 0)
      wristMovement += movement / shoulderWidth
      wristSamples += 1
    }
    previousWrists = wrists
  }

  function analyzeFrame(now) {
    sampleAudio(now)
    samplePose(now)
    animationFrame = requestAnimationFrame(analyzeFrame)
  }

  return {
    async activateAudio() {
      if (audioContext?.state === 'suspended') await audioContext.resume()
    },
    start() {
      cancelAnimationFrame(animationFrame)
      reset()
      animationFrame = requestAnimationFrame(analyzeFrame)
    },
    stop() {
      cancelAnimationFrame(animationFrame)
      animationFrame = 0
      const duration = Math.max(1, (performance.now() - startedAt) / 1000)
      const poseAvailable = Boolean(poseLandmarker && detectedPoseFrames > 0)
      const detectedRate = poseFrames ? detectedPoseFrames / poseFrames : 0
      const centeredRate = detectedPoseFrames ? centeredFrames / detectedPoseFrames : 0
      const stability = Math.max(0, 1 - Math.min(1, average(shoulderTilts) * 2.5 + standardDeviation(bodyCenters) * 4))
      const activity = Math.min(1, wristSamples ? (wristMovement / wristSamples) * 0.8 : 0)

      return {
        duration_seconds: duration,
        long_pause_count: longPauseCount,
        speech_ratio: totalAudioSamples ? speakingSamples / totalAudioSamples : 0,
        pose_analysis_available: poseAvailable,
        pose_detection_rate: poseAvailable ? detectedRate : null,
        centered_rate: poseAvailable ? centeredRate : null,
        posture_stability: poseAvailable ? stability : null,
        gesture_activity: poseAvailable ? activity : null,
      }
    },
    close() {
      cancelAnimationFrame(animationFrame)
      animationFrame = 0
      poseLandmarker?.close()
      if (audioContext && audioContext.state !== 'closed') audioContext.close()
    },
  }
}
