# Cache Review Process

This document establishes a formal cache review process for code changes affecting data modifications in the Training PWA application. The process ensures that all data mutations are accompanied by proper cache invalidation to maintain data consistency and prevent stale data issues.

## Overview

The Training PWA uses a sophisticated multi-layered caching system with Supabase as the primary data source. Cache invalidation is critical for maintaining data integrity across the application. This review process ensures that all code changes involving data modifications (CREATE, UPDATE, DELETE operations) properly implement cache invalidation according to established guidelines.

## When Reviews Are Required

Cache reviews are mandatory for any pull request that includes:

- **Data Mutation Changes**: Modifications to service files that perform database write operations (`exerciseService.js`, `programService.js`, `userService.js`, `workoutLogService.js`)
- **New Data Features**: Implementation of new features involving data persistence or modification
- **Cache Logic Changes**: Modifications to cache invalidation functions or patterns in `supabaseCache.js` or related utilities
- **API Endpoint Changes**: New or modified API endpoints that affect cached data
- **Migration Scripts**: Database migrations that could impact cached data structures
- **Bulk Operations**: Implementation of bulk data operations or imports

Reviews are not required for:
- Purely frontend UI changes without data mutations
- Documentation updates
- Test-only changes
- Configuration changes not affecting data flow

## Who Conducts Reviews

### Primary Reviewers
- **Senior Developers**: Team members with demonstrated expertise in caching and data consistency
- **Cache Maintainers**: Designated developers responsible for cache system maintenance
- **Lead Developers**: Technical leads with oversight of system architecture

### Secondary Reviewers
- **Architects**: For complex architectural changes affecting cache design
- **DevOps Engineers**: For cache-related infrastructure or performance concerns

### Reviewer Assignment
- Automatic assignment based on PR labels (`cache-review-required`)
- Rotation system to distribute review load
- Expertise-based assignment for complex cache scenarios

## Review Criteria

Reviews evaluate the following aspects:

### Invalidation Implementation
- Correct selection and usage of invalidation functions (`invalidateUserCache`, `invalidateWorkoutCache`, etc.)
- Immediate invalidation following successful database operations
- Proper handling of multi-user scenarios (coach-client relationships)
- Appropriate use of advanced invalidation methods for complex cases

### Data Dependency Analysis
- Identification of all affected cache patterns and keys
- Consideration of direct and indirect cache dependencies
- User-specific vs. global invalidation scope determination

### Testing and Validation
- Unit tests verifying invalidation function calls
- Integration tests confirming cache behavior after invalidation
- Edge case coverage (error scenarios, concurrent operations)

### Performance Considerations
- Minimization of unnecessary cache clearing
- Batch invalidation for related operations
- Impact assessment on cache hit rates and application performance

### Code Quality
- Proper import statements for invalidation functions
- Clear documentation and code comments explaining invalidation logic
- Adherence to established patterns and best practices

## Approval Workflow

### Standard Process
1. **PR Creation**: Developer creates PR with data modification changes
2. **Automatic Labeling**: System applies `cache-review-required` label based on file changes
3. **Initial Code Review**: Standard code review process occurs in parallel
4. **Cache Review Assignment**: Cache reviewer is automatically assigned
5. **Cache Review**: Reviewer evaluates against criteria using provided checklists
6. **Approval/Feedback**: Reviewer approves or requests changes with specific feedback
7. **Iteration**: Developer addresses feedback and resubmits
8. **Final Approval**: Both code and cache reviews approved
9. **Merge**: PR is merged after all approvals

### Timeline Expectations
- **Initial Review**: Within 24 hours of assignment
- **Feedback Response**: Within 48 hours for major issues
- **Resolution**: Critical cache issues resolved within 72 hours
- **Blocker Escalation**: Immediate escalation for merge-blocking issues

## Escalation Procedures

### Issue Severity Levels
- **Critical**: Cache invalidation missing or incorrect, potential for data corruption
- **Major**: Invalidation suboptimal but functional, performance impact
- **Minor**: Best practice violations, documentation issues

### Escalation Path
1. **Level 1**: Cache reviewer identifies issue and requests changes
2. **Level 2**: If unresolved after 48 hours, escalate to technical lead
3. **Level 3**: Technical lead involves architect for architectural concerns
4. **Level 4**: Escalation to CTO for systemic cache issues

### Escalation Triggers
- Reviewer disagreement on cache strategy
- Performance concerns requiring architectural review
- Security implications in cache handling
- Blocking issues preventing deployment

## Reviewer Checklists

### Invalidation Implementation Checklist
- [ ] Cache invalidation occurs immediately after successful database operations
- [ ] Correct invalidation function selected based on data scope and type
- [ ] User ID parameters included for user-specific invalidation
- [ ] Multi-user scenarios (coach-client) handled with appropriate invalidation for all parties
- [ ] Error handling ensures invalidation occurs even if subsequent operations fail
- [ ] Advanced invalidation methods used appropriately for complex scenarios

### Testing Coverage Checklist
- [ ] Unit tests include verification of invalidation function calls
- [ ] Mock verification confirms correct function calls with proper parameters
- [ ] Integration tests verify end-to-end cache behavior
- [ ] Edge cases tested (error scenarios, concurrent modifications, network failures)
- [ ] Cache consistency tests included for multi-user operations

### Code Quality Checklist
- [ ] Correct import statements for invalidation functions
- [ ] Invalidation calls placed after database operations in service methods
- [ ] Descriptive reasons provided for invalidation operations
- [ ] Code comments explain why specific invalidation is needed
- [ ] Performance optimized (batch operations, selective invalidation)
- [ ] Documentation updated for new cache patterns or changes

### Data Consistency Checklist
- [ ] All affected cache patterns identified and invalidated
- [ ] Indirect dependencies considered (aggregations, references)
- [ ] Race conditions addressed for concurrent data modifications
- [ ] Recovery mechanisms implemented for failed invalidations
- [ ] Cache monitoring and logging enabled for operations

## Review Documentation Templates

### Cache Review Summary Template
```
## Cache Review Summary

**PR Title:** [PR Title]
**Reviewer:** [Reviewer Name]
**Review Date:** [Date]

### Changes Reviewed
- [List of files/changes involving data modifications]

### Invalidation Analysis
- [Summary of cache invalidation requirements]
- [Functions used and rationale]

### Issues Found
- [ ] No issues
- [ ] Minor issues (documented below)
- [ ] Major issues requiring changes

### Specific Feedback
[Detail any issues, recommendations, or approvals]

### Testing Verification
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

### Approval Status
- [ ] Approved
- [ ] Approved with minor recommendations
- [ ] Changes required
- [ ] Escalated

**Reviewer Signature:** ____________________
```

### Cache Impact Assessment Template
```
## Cache Impact Assessment

**Feature/Change:** [Brief description]

### Data Operations
- **Create Operations:** [List tables/operations]
- **Update Operations:** [List tables/operations]
- **Delete Operations:** [List tables/operations]

### Affected Cache Patterns
- [List cache keys/patterns that will be invalidated]
- [Include user-specific and global patterns]

### Invalidation Strategy
- [Describe invalidation approach and functions used]
- [Explain multi-user considerations]

### Performance Impact
- **Estimated Cache Miss Rate:** [Percentage increase]
- **User Impact:** [Description of user experience impact]
- **Mitigation Strategies:** [Any performance optimizations]

### Testing Requirements
- [List required tests for validation]
- [Edge cases to cover]

### Rollback Plan
- [Cache recovery procedures if issues arise]
- [Monitoring alerts to implement]
```

## Integration with Existing Code Review Processes

### GitHub Integration
- **Labels**: Automatic `cache-review-required` label for qualifying PRs
- **Required Reviews**: Cache review approval required in branch protection rules
- **Checks**: Automated checks for cache-related file changes
- **Templates**: PR template includes cache review section

### Process Integration
1. **Parallel Reviews**: Code and cache reviews occur simultaneously
2. **Dependency Management**: Cache review can proceed before or after code review completion
3. **Communication**: Reviewers coordinate through PR comments and threads
4. **Status Tracking**: Clear status indicators for review progress

### Automation Opportunities
- **File Change Detection**: Automatic labeling based on modified files
- **Reviewer Assignment**: Intelligent assignment based on expertise and availability
- **Checklist Enforcement**: Automated checklist verification where possible
- **Integration Testing**: Automated cache invalidation testing in CI/CD pipeline

## Best Practices for Reviewers

### Preparation
- Review relevant cache documentation before starting
- Understand the data flow and dependencies affected
- Check recent similar changes for consistency

### During Review
- Use provided checklists systematically
- Test invalidation logic mentally or through code inspection
- Consider edge cases and failure scenarios
- Verify testing coverage is adequate

### Communication
- Provide specific, actionable feedback
- Reference documentation and guidelines
- Suggest improvements, not just identify problems
- Document rationale for approval or rejection

### Follow-up
- Monitor post-merge cache performance
- Contribute to guideline updates based on review experience
- Participate in cache system improvements

## Conclusion

This cache review process ensures that all data modifications in the Training PWA are properly validated for cache consistency. By integrating cache reviews into the standard development workflow, we maintain high standards of data integrity and application performance. Regular review and refinement of this process will help adapt to evolving cache requirements and team needs.

For questions or process improvements, contact the cache maintainers or technical leads.