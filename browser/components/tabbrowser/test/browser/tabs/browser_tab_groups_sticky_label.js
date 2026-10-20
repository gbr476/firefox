/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

const STICKY_LABEL_PREF = "browser.tabs.groups.stickyActiveLabel";

const arrowScrollbox = gBrowser.tabContainer.arrowScrollbox;
const scrollbox = arrowScrollbox.scrollbox;
const rect = el => el.getBoundingClientRect();

async function waitForNextFrame() {
  await new Promise(requestAnimationFrame);
  await new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
}

/**
 * Scrolls the tab strip so that its start is at the given position, relative
 * to the start of the scrolled tabs, and waits for the scroll to take effect.
 *
 * @param {number} position
 */
async function scrollTo(position) {
  scrollbox.scrollTo({ left: position, behavior: "instant" });
  await waitForNextFrame();
  info(
    `Scrolled to ${scrollbox.scrollLeft} of ${scrollbox.scrollWidth - scrollbox.clientWidth} (requested ${position})`
  );
}

/**
 * The scroll position at which the start of the tab strip is at the start
 * of the given element.
 *
 * @param {Element} element
 */
function scrollPositionOf(element) {
  return rect(element).left - rect(scrollbox).left + scrollbox.scrollLeft;
}

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [
      ["sidebar.verticalTabs", false],
      ["toolkit.scrollbox.smoothScroll", false],
    ],
  });
  await BrowserTestUtils.overflowTabs(registerCleanupFunction, window, {
    overflowAtStart: false,
    overflowTabFactor: 4,
  });
  registerCleanupFunction(() => {
    gBrowser.removeAllTabsBut(gBrowser.tabs[0], {
      skipWarnAboutClosingTabs: true,
    });
  });
  await BrowserTestUtils.allTabOpenAnimationsFinished(window);
  Assert.ok(arrowScrollbox.overflowing, "Tab strip is overflowing");
});

add_task(async function test_active_group_label_sticks_while_scrolling() {
  let tabs = gBrowser.tabs;
  let third = Math.floor(tabs.length / 3);
  let groupedTabs = tabs.slice(third, 2 * third);
  let group = gBrowser.addTabGroup(groupedTabs, {
    label: "sticky",
    insertBefore: tabs[2 * third],
  });
  let labelContainer = group.labelContainerElement;
  let nextGroupedTabs = tabs.slice(2 * third, 2 * third + 5);
  let nextGroup = gBrowser.addTabGroup(nextGroupedTabs, {
    label: "next",
    insertBefore: tabs[2 * third + 5],
  });
  let middleTab = groupedTabs[Math.floor(groupedTabs.length / 2)];
  let lastGroupedTab = groupedTabs.at(-1);
  await BrowserTestUtils.allTabOpenAnimationsFinished(window);

  gBrowser.selectedTab = middleTab;
  await waitForNextFrame();

  let isLabelAtStart = msg => {
    Assert.ok(labelContainer.hasAttribute("stuck"), `${msg}: label is stuck`);
    Assert.less(
      Math.abs(rect(labelContainer).left - rect(scrollbox).left),
      1,
      `${msg}: label is at the start of the tab strip`
    );
    Assert.equal(
      document
        .elementFromPoint(
          rect(scrollbox).left + 1,
          rect(labelContainer).top + rect(labelContainer).height / 2
        )
        .closest(".tab-group-label-container"),
      labelContainer,
      `${msg}: label is drawn on top of what's scrolled underneath it`
    );
    Assert.equal(
      getComputedStyle(labelContainer).backgroundColor,
      "rgba(0, 0, 0, 0)",
      `${msg}: label has no opaque background`
    );
    let midY = rect(labelContainer).top + rect(labelContainer).height / 2;
    labelContainer.style.pointerEvents = "none";
    let underLabel = document.elementFromPoint(rect(scrollbox).left + 2, midY);
    labelContainer.style.pointerEvents = "";
    Assert.ok(
      !underLabel?.closest(".tabbrowser-tab, .tab-group-label-container"),
      `${msg}: what's scrolled underneath the label is clipped`
    );
    Assert.ok(
      document
        .elementFromPoint(rect(labelContainer).right + 2, midY)
        ?.closest(".tabbrowser-tab, .tab-group-label-container"),
      `${msg}: what's next to the label is not clipped`
    );
  };

  await scrollTo(scrollPositionOf(middleTab));
  isLabelAtStart("Scrolled into the group");

  await scrollTo(scrollPositionOf(lastGroupedTab) + 2);
  isLabelAtStart("Scrolled to the end of the group");

  await scrollTo(scrollPositionOf(nextGroup.labelContainerElement) + 2);
  isLabelAtStart("Scrolled to the next group's label");

  await scrollTo(scrollPositionOf(nextGroupedTabs.at(-1)) + 2);
  isLabelAtStart("Scrolled past the next group");

  Assert.ok(middleTab.hasAttribute("stuck"), "Selected tab is stuck");
  Assert.less(
    Math.abs(rect(middleTab).left - rect(labelContainer).right),
    1,
    "Selected tab is kept right after the label"
  );
  let midY = rect(middleTab).top + rect(middleTab).height / 2;
  middleTab.style.pointerEvents = "none";
  let underSelectedTab = document.elementFromPoint(
    rect(middleTab).left + rect(middleTab).width / 2,
    midY
  );
  middleTab.style.pointerEvents = "";
  Assert.ok(
    !underSelectedTab?.closest(".tabbrowser-tab, .tab-group-label-container"),
    "What's scrolled underneath the selected tab is clipped"
  );

  EventUtils.synthesizeMouseAtCenter(middleTab, {});
  await waitForNextFrame();
  await waitForNextFrame();
  Assert.ok(
    !middleTab.hasAttribute("stuck"),
    "Clicking the stuck selected tab scrolls it back into place"
  );
  Assert.equal(gBrowser.selectedTab, middleTab, "Tab stays selected");
  Assert.less(
    Math.abs(rect(middleTab).left - rect(labelContainer).right),
    1,
    "Selected tab is right after the label"
  );
  let tabAfterMiddleTab = groupedTabs[groupedTabs.indexOf(middleTab) + 1];
  Assert.less(
    Math.abs(rect(tabAfterMiddleTab).left - rect(middleTab).right),
    1,
    "Selected tab is followed by the tab after it"
  );
  Assert.ok(
    !tabAfterMiddleTab.hasAttribute("stickylabelcovered"),
    "The tab after the selected tab isn't clipped"
  );

  await scrollTo(
    scrollPositionOf(groupedTabs[0]) - 3 * rect(labelContainer).width
  );
  Assert.ok(
    !labelContainer.hasAttribute("stuck"),
    "Label isn't stuck once its regular position is scrolled into view"
  );

  await scrollTo(scrollPositionOf(middleTab));
  Assert.ok(labelContainer.hasAttribute("stuck"), "Label is stuck again");

  gBrowser.selectedTab = tabs[0];
  await waitForNextFrame();
  await scrollTo(scrollPositionOf(middleTab));
  Assert.ok(
    !labelContainer.hasAttribute("stuck"),
    "Label doesn't stick when the group has no selected tab"
  );

  gBrowser.selectedTab = middleTab;
  await waitForNextFrame();
  Assert.ok(
    labelContainer.hasAttribute("stuck"),
    "Label sticks when selecting a tab in the group"
  );
  Assert.greaterOrEqual(
    Math.round(rect(middleTab).left),
    Math.round(rect(labelContainer).right),
    "Selected tab isn't hidden underneath the label"
  );

  await SpecialPowers.pushPrefEnv({ set: [[STICKY_LABEL_PREF, false]] });
  await scrollTo(scrollPositionOf(middleTab) + 1);
  Assert.ok(
    !labelContainer.hasAttribute("stuck"),
    "Label doesn't stick with the pref disabled"
  );
  await SpecialPowers.popPrefEnv();

  gBrowser.selectedTab = tabs[0];
  group.ungroupTabs();
  nextGroup.ungroupTabs();
});

add_task(async function test_collapsed_group_label_does_not_stick() {
  let tabs = gBrowser.tabs;
  let third = Math.floor(tabs.length / 3);
  let groupedTabs = tabs.slice(third, 2 * third);
  let group = gBrowser.addTabGroup(groupedTabs, {
    label: "collapsed",
    insertBefore: tabs[2 * third],
  });
  let labelContainer = group.labelContainerElement;
  await BrowserTestUtils.allTabOpenAnimationsFinished(window);

  gBrowser.selectedTab = groupedTabs[0];
  let collapseFinished = BrowserTestUtils.waitForEvent(
    window,
    "TabGroupCollapse"
  );
  group.collapsed = true;
  await collapseFinished;
  await waitForNextFrame();

  await scrollTo(scrollPositionOf(groupedTabs[0]) + 5);
  Assert.ok(
    !labelContainer.hasAttribute("stuck"),
    "Label of a collapsed group doesn't stick"
  );

  gBrowser.selectedTab = tabs[0];
  group.ungroupTabs();
});
