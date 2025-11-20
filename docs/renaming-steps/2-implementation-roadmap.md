# Implementation Roadmap: Completing plex_renamer_spec.md

## 🎯 Executive Summary

**Name-o-Tron 9000 already implements 85-90% of the plex_renamer_spec.md requirements.** The current codebase provides a sophisticated, production-ready media file renaming system that exceeds the original specification in many areas.

**Key Insight:** Rather than rebuilding existing functionality, focus on the missing 10-15% and polish the user experience.

## 📊 Current Status Summary

| Category | Steps | Status | Coverage |
|----------|-------|--------|----------|
| **Core Engine** | Steps 1-11 | ✅ **100% Complete** | Fully implemented with advanced features |
| **Safety & Recovery** | Steps 12-15 | 🟡 **75% Complete** | Missing quarantine, YOLO mode needs UI |
| **Polish & UX** | Steps 16-20 | 🟡 **80% Complete** | Good foundation, needs enhancements |
| **Overall** | All 20 Steps | 🟢 **~85% Complete** | Production ready, minor gaps |

## 🚀 Prioritized Implementation Plan

### Phase 1: Essential Missing Features (High Impact, Low Effort)

#### 1.1 Quarantine System (Step 15) 🔥 **TOP PRIORITY**
**Impact:** High - Provides safety net for moved files
**Effort:** Medium - New feature implementation
**Value:** Critical for user confidence in renaming operations

**Implementation Plan:**
```typescript
// Add to GeneralSettings
quarantine: {
  enabled: true,
  retentionDays: 30,
  location: "~/.nameotron/quarantine"
}

// Add quarantine operations to rename engine
// UI: "Restore from Quarantine" button
// Auto-cleanup based on retention policy
```

**Files to Modify:**
- `src/state/settings.tsx` - Add quarantine settings
- `src-tauri/src/video_rename.rs` - Implement quarantine moves
- `src/pages/Settings/General.tsx` - Add UI controls
- `src-tauri/src/lib.rs` - Add quarantine management commands

#### 1.2 YOLO Mode UI (Step 13) 🔥 **HIGH PRIORITY**
**Impact:** High - Enables power user workflows
**Effort:** Low - Mostly UI enhancement
**Value:** Completes the "process everything" user story

**Implementation Plan:**
- Add "YOLO Mode" toggle to General settings
- Implement "Process All Libraries" button in Preview page
- Add safety confirmation dialog for YOLO operations
- Ensure silent global dry-run before execution

**Files to Modify:**
- `src/pages/Preview/PreviewTemplate.tsx` - Add YOLO mode UI
- `src/pages/Settings/General.tsx` - Add YOLO toggle
- `src-tauri/src/video_rename.rs` - Add library-wide processing

### Phase 2: Quality of Life Improvements (Medium Impact, Medium Effort)

#### 2.1 Enhanced Debug Logging (Step 17)
**Impact:** Medium - Better troubleshooting for users
**Effort:** Medium - Logging infrastructure improvements
**Value:** Improves support and user confidence

**Implementation Plan:**
- Add debug logging toggle to Misc settings
- Implement structured log export (JSON/CSV)
- Add log viewer in Settings page
- Include performance metrics and error categorization

#### 2.2 Sandbox Mode (Step 16)
**Impact:** Medium - Enables safe testing workflows
**Effort:** Medium - Script generation feature
**Value:** Allows users to verify operations before execution

**Implementation Plan:**
- Add "Sandbox Mode" toggle to General settings
- Generate .sh/.bat/.ps1 scripts instead of executing renames
- Provide script preview and download functionality
- Include rollback script generation

### Phase 3: Documentation & Polish (Low Effort, High Value)

#### 3.1 Step-by-Step Documentation
**Impact:** High - Improves user understanding and support
**Effort:** Low - Documentation work
**Value:** Makes sophisticated features accessible to all users

**Implementation Plan:**
- Document each plex_renamer_spec.md step with current implementation
- Create user guides for advanced features (YOLO mode, quarantine, templates)
- Add inline help and tooltips throughout the UI
- Create troubleshooting guides for common issues

#### 3.2 Advanced Template Features
**Impact:** Medium - Enhances power user capabilities
**Effort:** Low - Template engine already sophisticated
**Value:** Completes the template system polish

**Implementation Plan:**
- Add template validation and error reporting
- Implement template presets and sharing
- Add advanced placeholder documentation
- Create template testing interface

## 🛠 Technical Implementation Details

### Architecture Strengths to Leverage

**Current Architecture Advantages:**
1. **Robust Settings System** - Already handles complex nested configurations
2. **Template Engine** - Sophisticated with optional groups and formatting
3. **Safety Systems** - Traffic-light validation already implemented
4. **Backend Integration** - Tauri commands provide clean separation
5. **Error Handling** - Comprehensive error categorization exists

**Implementation Strategy:**
- **Leverage existing patterns** - Use current settings/template architecture
- **Add new commands** - Extend Tauri command interface for new features
- **Maintain safety** - Ensure new features respect existing safety constraints
- **Preserve UX** - Follow established Container/Presentational patterns

### Code Organization for New Features

```
docs/renaming-steps/
├── 0-analysis-current-state.md      # ✅ Complete
├── 1-step-mapping-analysis.md       # ✅ Complete
├── 2-implementation-roadmap.md      # 📝 This document
├── 3-quarantine-implementation.md   # 🔄 To implement
├── 4-yolo-mode-implementation.md    # 🔄 To implement
├── 5-sandbox-mode-implementation.md # 🔄 To implement
└── 6-documentation-guide.md         # 🔄 To implement
```

## 📋 Detailed Implementation Checklist

### Phase 1: Essential Features

#### Quarantine System Implementation
- [ ] Add quarantine settings to `GeneralSettings` type
- [ ] Implement quarantine directory management in Rust backend
- [ ] Add quarantine move operations to rename engine
- [ ] Create UI controls in General settings tab
- [ ] Add "Empty Quarantine" and "Restore" functionality
- [ ] Implement retention policy enforcement
- [ ] Add quarantine status to rename logs

#### YOLO Mode Implementation
- [ ] Add YOLO mode toggle to `GeneralSettings`
- [ ] Implement "Process All" button in Preview page
- [ ] Add safety confirmation dialog for YOLO operations
- [ ] Ensure global dry-run validation before execution
- [ ] Add progress tracking for multi-library operations
- [ ] Implement graceful handling of partial failures

### Phase 2: Quality Improvements

#### Enhanced Debug Logging
- [ ] Add debug logging settings to `MiscSettings`
- [ ] Implement structured log export functionality
- [ ] Create log viewer component for Settings page
- [ ] Add performance metrics collection
- [ ] Implement log filtering and search

#### Sandbox Mode
- [ ] Add sandbox mode toggle to `GeneralSettings`
- [ ] Implement script generation for rename operations
- [ ] Add script preview and download functionality
- [ ] Generate rollback scripts alongside rename scripts
- [ ] Support multiple script formats (.sh, .bat, .ps1)

### Phase 3: Documentation & Polish

#### Comprehensive Documentation
- [ ] Create detailed template engine documentation
- [ ] Document all settings options with examples
- [ ] Add troubleshooting guides for common issues
- [ ] Create video tutorial guides
- [ ] Document advanced features (YOLO, quarantine, sandbox)

## 🎯 Success Metrics

**Completion Criteria:**
- [ ] **Quarantine System** - Files moved during rename have 30-day retention period
- [ ] **YOLO Mode** - One-click processing of entire libraries with safety checks
- [ ] **Sandbox Mode** - Generate executable scripts for testing rename operations
- [ ] **Documentation** - All features documented with examples and troubleshooting

**Quality Gates:**
- [ ] All new features respect existing safety constraints
- [ ] New features integrate seamlessly with current UI/UX patterns
- [ ] Comprehensive error handling for edge cases
- [ ] Backward compatibility maintained
- [ ] Performance impact assessed and optimized

## 🚦 Risk Assessment

**Low Risk Items:**
- Documentation improvements (no code changes)
- Template system enhancements (existing engine is robust)
- Debug logging improvements (adds visibility, doesn't change behavior)

**Medium Risk Items:**
- Sandbox mode (new execution path, but generates scripts only)
- YOLO mode UI (new workflow, but leverages existing engine)

**Higher Risk Items:**
- Quarantine system (new filesystem operations, potential for data loss if buggy)

**Mitigation Strategies:**
- Implement quarantine with extensive safety checks and testing
- Add feature flags for gradual rollout of new capabilities
- Maintain comprehensive test coverage for all new features
- Document rollback procedures for each new feature

## 📅 Recommended Timeline

**Week 1-2:** Quarantine System (highest safety impact)
**Week 3-4:** YOLO Mode UI (highest user experience impact)
**Week 5-6:** Sandbox Mode & Enhanced Logging (quality improvements)
**Week 7-8:** Documentation & Polish (user experience completion)

**Total Estimated Effort:** 6-8 weeks for complete implementation, leveraging existing robust architecture.

## 💡 Key Insights for Implementation

1. **Leverage Existing Architecture** - The current system is sophisticated and handles most requirements
2. **Focus on User Experience** - The missing features are primarily about making powerful features accessible
3. **Maintain Safety First** - Any new features must respect the existing safety constraints
4. **Document as You Go** - Each implementation should include comprehensive documentation
5. **Test Thoroughly** - New filesystem operations require extensive testing

This roadmap provides a clear path to complete the plex_renamer_spec.md implementation while building on the existing high-quality foundation.

