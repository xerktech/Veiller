# Test Gallery Data - Quick Start Guide

## 🎯 Overview

Test data has been added to the gallery to make it easy to test the new MediaGalleryViewer component with zoom, pan, and mixed media support.

## 📦 What's Included

The test gallery includes:

- **8 test images** from Lorem Picsum (random high-quality photos)
- **2 test videos** from Google's sample video bucket (Big Buck Bunny & Elephant's Dream)
- Mixed portrait and landscape orientations
- Various timestamps to test sorting

## 🚀 How to Use

### Option 1: Test Data is Already Enabled ✅

Test data is **already enabled** by default in development mode! Just run the app:

```bash
cd /Users/veiller/Documents/VeillerApps/Veiller/mobile
bun android  # or bun ios
```

Navigate to **Glasses Gallery** and you'll see 10 test items (8 images + 2 videos).

### Option 2: Disable Test Data

To disable test data, edit:

**File**: `mobile/src/utils/testGalleryData.ts`

Change line 118:

```typescript
export const ENABLE_TEST_GALLERY_DATA = true // Change to false
```

## 🧪 Testing Checklist

### Image Tests

1. ✅ **Tap any image** → Gallery viewer should open
2. ✅ **Pinch to zoom** → Image should zoom in/out smoothly (1x to 4x)
3. ✅ **Double-tap** → Should toggle between 1x and 2.5x zoom
4. ✅ **Pan while zoomed** → Should move around the image
5. ✅ **Swipe left/right** → Should navigate between images
6. ✅ **Swipe down** → Should dismiss and return to grid

### Video Tests

1. ✅ **Tap "test_video_1.mp4"** → Video player should open
2. ✅ **Play/pause button** → Should control playback
3. ✅ **Seek bar** → Should allow scrubbing through video
4. ✅ **Tap screen** → Should toggle controls visibility
5. ✅ **Controls auto-hide** → Should hide after 3 seconds

### Mixed Media Tests

1. ✅ **Swipe from image to video** → Should work seamlessly
2. ✅ **Swipe from video to image** → Should work seamlessly
3. ✅ **Gallery counter** → Should show correct position (e.g., "3 / 10")

### Gesture Tests

1. ✅ **Zoom then swipe** → Swiping should only work when zoomed out to 1x
2. ✅ **Dismiss while zoomed** → Should NOT dismiss (only works at 1x zoom)
3. ✅ **Fast swipe** → Should animate smoothly without jank

## 📸 Test Images

All test images are served from **picsum.photos** - a free Lorem Ipsum service for photos:

- Random high-quality photos
- Various subjects and compositions
- Different aspect ratios (800x600, 600x800)

## 🎬 Test Videos

Test videos from Google's public sample bucket:

1. **Big Buck Bunny** (158 MB) - Animated short film
2. **Elephant's Dream** (234 MB) - Animated short film

Both videos are:

- MP4 format
- Publicly accessible
- Good for testing video player controls

## 🔧 Customization

### Add Your Own Test Media

Edit `mobile/src/utils/testGalleryData.ts`:

```typescript
export const TEST_GALLERY_ITEMS: PhotoInfo[] = [
  {
    name: "my_test_image.jpg",
    url: "https://example.com/image.jpg",
    download: "https://example.com/image.jpg",
    size: 123456,
    modified: Date.now(),
    mime_type: "image/jpeg",
    is_video: false,
  },
  // Add more items...
]
```

### Use Local Images

For local images, provide a `file://` URL:

```typescript
{
  name: "local_image.jpg",
  url: "file:///path/to/image.jpg",
  filePath: "/path/to/image.jpg",
  // ... other fields
}
```

## 🐛 Troubleshooting

### Images Not Loading

- Check internet connection (test images are from picsum.photos)
- Check console for network errors
- Try refreshing the gallery (pull to refresh)

### Videos Not Playing

- Videos require network access
- Large videos may take time to buffer
- Check device codec support (MP4 should work everywhere)

### Test Data Not Showing

1. Verify `ENABLE_TEST_GALLERY_DATA` is `true`
2. Rebuild the app (`bun android` or `bun ios`)
3. Check console logs for "Adding X test items for development"

## 📝 Notes

- Test data appears **before** your actual photos in the gallery
- Test data is **only available in development mode**
- Test items are marked with `glassesModel: "G1"` for identification
- No test data is permanently stored - it's recreated on each app launch

## ✨ Pro Tips

1. **Test with airplane mode** → Verifies locally cached images work
2. **Test with slow network** → Verifies loading states
3. **Test with many items** → Add more test items to verify performance
4. **Test on different devices** → Verify gestures work on various screen sizes

---

**Happy Testing! 🎉**

For questions or issues, check the main implementation summary:
[`MEDIA_VIEWER_UPGRADE_SUMMARY.md`](./MEDIA_VIEWER_UPGRADE_SUMMARY.md)
