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
echo "Commit message: $COMMIT_MSG"

# If commit message is a bump, valid for sync merge, but we don't release again
if [[ "$COMMIT_MSG" == *"chore: bump version"* ]]; then
   echo "Sync merge detected - skipping release logic"
   echo "should_release=false" >> $GITHUB_OUTPUT
   exit 0
fi

CURRENT_VERSION=$(jq -r .version package.json)
IFS='.' read -r MAJOR MINOR PATCH <<< "${CURRENT_VERSION%%-*}"

# Check for explicit overrides first
if echo "$COMMIT_MSG" | grep -qiE '#major|BREAKING CHANGE'; then
  echo "Major bump detected"
  MAJOR=$((MAJOR + 1))
  MINOR=0
  PATCH=0
  UPDATE_STABLE=true
elif echo "$COMMIT_MSG" | grep -qi '#patch'; then
  echo "Explicit patch bump"
  PATCH=$((PATCH + 1))
  UPDATE_STABLE=false
elif echo "$COMMIT_MSG" | grep -qiE '^feat(\(.+\))?:'; then
  echo "Feature commit - minor bump"
  MINOR=$((MINOR + 1))
  PATCH=0
  UPDATE_STABLE=false
else
  echo "Default patch bump"
  PATCH=$((PATCH + 1))
  UPDATE_STABLE=false
fi

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
echo "version=$NEW_VERSION" >> $GITHUB_OUTPUT
echo "should_release=true" >> $GITHUB_OUTPUT
echo "update_stable=$UPDATE_STABLE" >> $GITHUB_OUTPUT
