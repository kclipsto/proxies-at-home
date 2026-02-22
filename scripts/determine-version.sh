#!/bin/bash
set -e

# Default to values if not provided via inputs
EVENT_NAME=${GITHUB_EVENT_NAME:-"push"}
REF=${GITHUB_REF:-$(git symbolic-ref HEAD)}
PROMOTE_STABLE=${INPUT_PROMOTE_STABLE:-"false"}

echo "Event: $EVENT_NAME"
echo "Ref: $REF"

# Check if this is a promote-only workflow dispatch
if [[ "$EVENT_NAME" == "workflow_dispatch" && "$PROMOTE_STABLE" == "true" ]]; then
  echo "Promote stable workflow triggered"
  CURRENT_VERSION=$(jq -r .version package.json)
  echo "version=$CURRENT_VERSION" >> $GITHUB_OUTPUT
  echo "should_release=false" >> $GITHUB_OUTPUT
  echo "update_stable=true" >> $GITHUB_OUTPUT
  echo "is_promote_only=true" >> $GITHUB_OUTPUT
  exit 0
fi

echo "is_promote_only=false" >> $GITHUB_OUTPUT

# If triggered by tag, use tag version (Legacy/Manual tag support)
if [[ "$REF" == refs/tags/v* ]]; then
  VERSION="${REF#refs/tags/v}"
  echo "version=$VERSION" >> $GITHUB_OUTPUT
  echo "should_release=true" >> $GITHUB_OUTPUT
  
  # Major releases also update stable
  MAJOR=$(echo "$VERSION" | cut -d. -f1)
  OLD_VERSION=$(git show HEAD~1:package.json 2>/dev/null | jq -r .version || echo "0.0.0")
  OLD_MAJOR=$(echo "$OLD_VERSION" | cut -d. -f1)
  if [[ "$MAJOR" != "$OLD_MAJOR" ]]; then
    echo "update_stable=true" >> $GITHUB_OUTPUT
  else
    echo "update_stable=false" >> $GITHUB_OUTPUT
  fi
  exit 0
fi

# Release Branch Detection
if [[ "$REF" == refs/heads/release/v* ]]; then
   echo "Running on Release Branch"
   # Version is already set in package.json on this branch
   VERSION=$(jq -r .version package.json)
   echo "version=$VERSION" >> $GITHUB_OUTPUT
   echo "should_release=true" >> $GITHUB_OUTPUT
   
   # Check if this is a major release to update stable
   IFS='.' read -r MAJOR MINOR PATCH <<< "${VERSION%%-*}"
   if [[ "$MINOR" == "0" && "$PATCH" == "0" ]]; then
      echo "update_stable=true" >> $GITHUB_OUTPUT
   else
      echo "update_stable=false" >> $GITHUB_OUTPUT
   fi
   exit 0
fi

# Branch push to main - analyze commit for version bump type
COMMIT_MSG=$(git log -1 --pretty=%B)
echo "Latest commit message: $COMMIT_MSG"

# Get all commit messages since last tag for scanning
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null || echo "")
if [ -n "$LAST_TAG" ]; then
  echo "Scanning commits since $LAST_TAG..."
  COMMIT_HISTORY=$(git log "$LAST_TAG"..HEAD --pretty=%B)
else
  echo "No previous tags found, scanning full history..."
  COMMIT_HISTORY=$(git log --pretty=%B)
fi

SCAN_TEXT="$COMMIT_HISTORY"
if [ -n "$PR_BODY" ]; then
  echo "PR body provided for scanning"
  SCAN_TEXT="$COMMIT_HISTORY $PR_BODY"
fi

if [[ "$COMMIT_MSG" == *"chore: bump version"* ]]; then
   echo "Sync merge detected - skipping release logic"
   echo "should_release=false" >> $GITHUB_OUTPUT
   exit 0
fi

CURRENT_VERSION=$(jq -r .version package.json)
IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT_VERSION%%-*}"

SHOULD_RELEASE=false
UPDATE_STABLE=false

# 1. Determine Version Bump
# Tags use `release:<type>` format to avoid git stripping lines starting with #
# Scan both commit message and PR body for release tags
if echo "$SCAN_TEXT" | grep -qiE 'release:major|BREAKING CHANGE'; then
    echo "Major bump detected - Releasing"
    MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0
    SHOULD_RELEASE=true
    UPDATE_STABLE=true
elif echo "$SCAN_TEXT" | grep -qiE 'release:minor'; then
    echo "Explicit minor bump detected - Releasing"
    MINOR=$((MINOR + 1)); PATCH=0
    SHOULD_RELEASE=true
elif echo "$SCAN_TEXT" | grep -qiE 'release:patch'; then
    echo "Explicit patch bump - Releasing"
    PATCH=$((PATCH + 1))
    SHOULD_RELEASE=true
elif echo "$COMMIT_MSG" | grep -qiE '^feat(\(.+\))?:'; then
    echo "Feature commit - minor bump (No Release)"
    MINOR=$((MINOR + 1)); PATCH=0
else
    echo "Default patch bump (No Release)"
    PATCH=$((PATCH + 1))
fi
# 2. Check for Independent Release Triggers/Modifiers
if echo "$SCAN_TEXT" | grep -qiE 'release:stable'; then
    echo "Stable tag detected - forcing stable channel update and Releasing"
    SHOULD_RELEASE=true
    UPDATE_STABLE=true
fi

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "version=$NEW_VERSION" >> $GITHUB_OUTPUT
echo "should_release=$SHOULD_RELEASE" >> $GITHUB_OUTPUT
echo "update_stable=$UPDATE_STABLE" >> $GITHUB_OUTPUT
