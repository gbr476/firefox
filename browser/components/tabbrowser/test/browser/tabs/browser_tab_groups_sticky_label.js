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
 * Selects the tab and waits for the sticky elements to be updated for it:
 * that happens in the animation frame in which the tab gets scrolled into
 * view, and the resulting scroll event is dispatched in the frame after.
 *
 * @param {MozTabbrowserTab} tab
 */
async function selectTab(tab) {
  gBrowser.selectedTab = tab;
  await waitForNextFrame();
  await waitForNextFrame();
}

/**
 * Scrolls the tab strip so that its start is at the given position, relative
 * to the start of the scrolled tabs, and waits for the scroll event that
 * updates the sticky elements.
 *
 * @param {number} position
 */
async function scrollTo(position) {
  let before = scrollbox.scrollLeft;
  scrollbox.scrollTo({ left: position, behavior: "instant" });
  if (scrollbox.scrollLeft != before) {
    await BrowserTestUtils.waitForEvent(arrowScrollbox, "scroll");
  }
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

/**
 * Clicks the stuck selected tab, which scrolls it back into place, and waits
 * for the scroll event that updates the sticky elements.
 *
 * @param {MozTabbrowserTab} tab
 */
async function clickStuckTab(tab) {
  Assert.ok(tab.hasAttribute("stuck"), "Tab is stuck before clicking it");
  let scrolled = BrowserTestUtils.waitForEvent(arrowScrollbox, "scroll");
  EventUtils.synthesizeMouseAtCenter(tab, {});
  await scrolled;
  Assert.ok(!tab.hasAttribute("stuck"), "Clicked tab isn't stuck anymore");
  Assert.equal(gBrowser.selectedTab, tab, "Clicked tab stays selected");
}

/**
 * Clicks one of the tab strip's scroll buttons and waits for the scroll
 * event that updates the sticky elements.
 *
 * @param {Element} button
 */
async function clickScrollButton(button) {
  let scrolled = BrowserTestUtils.waitForEvent(arrowScrollbox, "scroll");
  EventUtils.synthesizeMouseAtCenter(button, {});
  await scrolled;
}

/**
 * The topmost tab or group label at the given point.
 *
 * @param {number} x
 * @param {number} y
 * @returns {Element|null}
 */
function tabOrLabelAt(x, y) {
  return (
    document
      .elementFromPoint(x, y)
      ?.closest(".tabbrowser-tab, .tab-group-label-container") ?? null
  );
}

/**
 * Asserts that the (stuck) element covers the given x coordinate, with what's
 * underneath it clipped away.
 *
 * @param {Element} element
 * @param {number} x
 * @param {string} msg
 */
function assertCoversClipped(element, x, msg) {
  let y = rect(element).top + rect(element).height / 2;
  Assert.equal(tabOrLabelAt(x, y), element, `${msg}: is drawn on top`);
  element.style.pointerEvents = "none";
  let underneath = tabOrLabelAt(x, y);
  element.style.pointerEvents = "";
  Assert.equal(underneath, null, `${msg}: what's underneath is clipped`);
}

function assertAtStart(element, msg) {
  Assert.ok(element.hasAttribute("stuck"), `${msg}: is stuck`);
  Assert.less(
    Math.abs(rect(element).left - rect(scrollbox).left),
    1,
    `${msg}: is at the start of the tab strip`
  );
}

function assertAtEnd(element, msg) {
  Assert.ok(element.hasAttribute("stuck"), `${msg}: is stuck`);
  Assert.less(
    Math.abs(rect(element).right - rect(scrollbox).right),
    1,
    `${msg}: is at the end of the tab strip`
  );
}

function assertRightAfter(element, previous, msg) {
  Assert.less(
    Math.abs(rect(element).left - rect(previous).right),
    1,
    `${msg}: is right after the element before it`
  );
}

/**
 * Groups the middle third of the tabs, which spans more than the width of
 * the tab strip given the overflowTabFactor of the setup.
 *
 * @param {string} label
 */
function groupMiddleThird(label) {
  let tabs = gBrowser.tabs;
  let third = Math.floor(tabs.length / 3);
  let groupedTabs = tabs.slice(third, 2 * third);
  let group = gBrowser.addTabGroup(groupedTabs, {
    label,
    insertBefore: tabs[2 * third],
  });
  return { tabs, third, groupedTabs, group };
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

add_task(async function test_label_and_selected_tab_stick_at_the_start() {
  let { tabs, third, groupedTabs, group } = groupMiddleThird("sticky");
  let labelContainer = group.labelContainerElement;
  let nextGroupedTabs = tabs.slice(2 * third, 2 * third + 5);
  let nextGroup = gBrowser.addTabGroup(nextGroupedTabs, {
    label: "next",
    insertBefore: tabs[2 * third + 5],
  });
  let middleTab = groupedTabs[Math.floor(groupedTabs.length / 2)];
  let tabAfterMiddleTab = groupedTabs[groupedTabs.indexOf(middleTab) + 1];
  let lastGroupedTab = groupedTabs.at(-1);
  await BrowserTestUtils.allTabOpenAnimationsFinished(window);

  await selectTab(middleTab);

  let assertStuckAtStart = msg => {
    assertAtStart(labelContainer, `${msg}: label`);
    assertCoversClipped(
      labelContainer,
      rect(scrollbox).left + 2,
      `${msg}: label`
    );
    Assert.equal(
      getComputedStyle(labelContainer).backgroundColor,
      "rgba(0, 0, 0, 0)",
      `${msg}: label has no opaque background`
    );
    Assert.ok(middleTab.hasAttribute("stuck"), `${msg}: selected tab is stuck`);
    assertRightAfter(middleTab, labelContainer, `${msg}: selected tab`);
    assertCoversClipped(
      middleTab,
      rect(middleTab).left + rect(middleTab).width / 2,
      `${msg}: selected tab`
    );
    Assert.ok(
      tabOrLabelAt(
        rect(middleTab).right + 2,
        rect(middleTab).top + rect(middleTab).height / 2
      ),
      `${msg}: what's next to the selected tab is not clipped`
    );
  };

  await scrollTo(scrollPositionOf(middleTab) + rect(middleTab).width);
  assertStuckAtStart("Scrolled past the selected tab");

  await scrollTo(scrollPositionOf(lastGroupedTab) + 2);
  assertStuckAtStart("Scrolled to the end of the group");

  await scrollTo(scrollPositionOf(nextGroup.labelContainerElement) + 2);
  assertStuckAtStart("Scrolled to the next group's label");

  await scrollTo(scrollPositionOf(nextGroupedTabs.at(-1)) + 2);
  assertStuckAtStart("Scrolled past the next group");

  await clickStuckTab(middleTab);
  assertAtStart(labelContainer, "After clicking the selected tab: label");
  assertRightAfter(middleTab, labelContainer, "Selected tab");
  assertRightAfter(tabAfterMiddleTab, middleTab, "Tab after the selected tab");
  Assert.ok(
    !tabAfterMiddleTab.hasAttribute("stickycovered"),
    "The tab after the selected tab isn't clipped"
  );

  await scrollTo(
    scrollPositionOf(groupedTabs[0]) - 3 * rect(labelContainer).width
  );
  Assert.ok(
    !labelContainer.hasAttribute("stuck"),
    "Label isn't stuck once its regular position is scrolled into view"
  );
  Assert.ok(
    !middleTab.hasAttribute("stuck"),
    "Selected tab isn't stuck once in view"
  );

  await scrollTo(scrollPositionOf(middleTab) + rect(middleTab).width);
  assertStuckAtStart("Scrolled past the selected tab again");

  await selectTab(tabs[0]);
  await scrollTo(scrollPositionOf(middleTab) + rect(middleTab).width);
  Assert.ok(
    !labelContainer.hasAttribute("stuck"),
    "Label doesn't stick when the group has no selected tab"
  );
  Assert.ok(
    !middleTab.hasAttribute("stuck"),
    "Tab doesn't stick when it isn't selected"
  );

  await selectTab(middleTab);
  assertAtStart(labelContainer, "After selecting a tab in the group: label");
  Assert.greaterOrEqual(
    Math.round(rect(middleTab).left),
    Math.round(rect(labelContainer).right),
    "Selected tab isn't scrolled into view underneath the label"
  );

  await SpecialPowers.pushPrefEnv({ set: [[STICKY_LABEL_PREF, false]] });
  await waitForNextFrame();
  Assert.ok(
    !labelContainer.hasAttribute("stuck"),
    "Label doesn't stick with the pref disabled"
  );
  await SpecialPowers.popPrefEnv();
  await waitForNextFrame();
  assertAtStart(labelContainer, "With the pref enabled again: label");

  await selectTab(tabs[0]);
  group.ungroupTabs();
  nextGroup.ungroupTabs();
});

add_task(async function test_selected_tab_and_label_stick_at_the_end() {
  let { tabs, groupedTabs, group } = groupMiddleThird("end");
  let labelContainer = group.labelContainerElement;
  await BrowserTestUtils.allTabOpenAnimationsFinished(window);
  let tabWidth = rect(groupedTabs[0]).width;
  // Scrolls so that the tab's regular position ends the given number of tab
  // widths past the end of the tab strip.
  let scrollTabPastEnd = (tab, tabWidths) =>
    scrollTo(
      scrollPositionOf(tab) +
        rect(tab).width -
        scrollbox.clientWidth -
        tabWidths * tabWidth
    );

  // The label's regular position would end up underneath the stuck tab, so
  // the label is stuck at the end too, and clicking the tab scrolls both to
  // the start.
  let firstTab = groupedTabs[0];
  await selectTab(firstTab);
  await scrollTabPastEnd(firstTab, 3);
  assertAtEnd(firstTab, "Selected first tab");
  assertCoversClipped(
    firstTab,
    rect(firstTab).left + rect(firstTab).width / 2,
    "Selected first tab"
  );
  Assert.ok(labelContainer.hasAttribute("stuck"), "Label is stuck");
  assertRightAfter(firstTab, labelContainer, "Selected first tab");
  assertCoversClipped(labelContainer, rect(labelContainer).left + 2, "Label");
  Assert.ok(
    tabOrLabelAt(
      rect(labelContainer).left - 2,
      rect(firstTab).top + rect(firstTab).height / 2
    ),
    "What's before the label is not clipped"
  );

  await clickStuckTab(firstTab);
  Assert.ok(
    !labelContainer.hasAttribute("stuck"),
    "Label is at its regular position after clicking the first tab"
  );
  Assert.less(
    Math.abs(rect(labelContainer).left - rect(scrollbox).left),
    1,
    "Label is at the start of the tab strip"
  );
  assertRightAfter(firstTab, labelContainer, "Selected first tab");
  assertRightAfter(groupedTabs[1], firstTab, "Tab after the selected tab");

  // The label's regular position stays in view, clear of the stuck tab.
  let fourthTab = groupedTabs[3];
  await selectTab(fourthTab);
  await scrollTabPastEnd(fourthTab, 2);
  assertAtEnd(fourthTab, "Selected fourth tab");
  Assert.ok(
    !labelContainer.hasAttribute("stuck"),
    "Label in view at its regular position isn't stuck"
  );
  Assert.greaterOrEqual(
    Math.round(rect(labelContainer).left),
    Math.round(rect(scrollbox).left),
    "Label is in view"
  );
  Assert.lessOrEqual(
    Math.round(rect(labelContainer).right),
    Math.round(rect(fourthTab).left),
    "Label is clear of the stuck selected tab"
  );

  await clickStuckTab(fourthTab);
  Assert.less(
    Math.abs(rect(fourthTab).right - rect(scrollbox).right),
    1,
    "Selected fourth tab is scrolled back into place at the end"
  );
  Assert.ok(
    !labelContainer.hasAttribute("stuck"),
    "Label stays at its regular position"
  );
  Assert.greaterOrEqual(
    Math.round(rect(labelContainer).left),
    Math.round(rect(scrollbox).left),
    "Label is still in view"
  );

  // The label's regular position is scrolled out at the start.
  let lastTab = groupedTabs.at(-1);
  await selectTab(lastTab);
  await scrollTabPastEnd(lastTab, 2);
  assertAtEnd(lastTab, "Selected last tab");
  assertAtStart(labelContainer, "Label");

  await clickStuckTab(lastTab);
  Assert.less(
    Math.abs(rect(lastTab).right - rect(scrollbox).right),
    1,
    "Selected last tab is scrolled back into place at the end"
  );
  assertAtStart(labelContainer, "After clicking the last tab: label");

  await selectTab(tabs[0]);
  group.ungroupTabs();
});

add_task(async function test_scroll_buttons_skip_stuck_elements() {
  let { tabs, groupedTabs, group } = groupMiddleThird("buttons");
  let labelContainer = group.labelContainerElement;
  await BrowserTestUtils.allTabOpenAnimationsFinished(window);
  let middleIndex = Math.floor(groupedTabs.length / 2);
  let middleTab = groupedTabs[middleIndex];
  let tabBeforeMiddleTab = groupedTabs[middleIndex - 1];

  await selectTab(middleTab);
  await scrollTo(scrollPositionOf(middleTab));
  assertAtStart(labelContainer, "Label");
  Assert.ok(middleTab.hasAttribute("stuck"), "Selected tab is stuck");

  Assert.equal(
    arrowScrollbox._elementFromPoint(rect(scrollbox).left - 1),
    tabBeforeMiddleTab,
    "The element scrolled out at the start is found underneath the stuck ones"
  );
  await clickScrollButton(arrowScrollbox._scrollButtonUp);
  Assert.ok(
    !tabBeforeMiddleTab.hasAttribute("stickycovered"),
    "Scrolling back by one element brings the tab before the start into view"
  );
  assertRightAfter(tabBeforeMiddleTab, labelContainer, "That tab");

  let lastTab = groupedTabs.at(-1);
  await selectTab(lastTab);
  await scrollTo(
    scrollPositionOf(lastTab) +
      rect(lastTab).width -
      scrollbox.clientWidth -
      2 * rect(lastTab).width
  );
  assertAtEnd(lastTab, "Selected last tab");
  let tabAtEnd = arrowScrollbox._elementFromPoint(rect(scrollbox).right + 1);
  Assert.ok(
    tabAtEnd && !tabAtEnd.hasAttribute("stuck"),
    "The element scrolled out at the end is found underneath the stuck tab"
  );
  await clickScrollButton(arrowScrollbox._scrollButtonDown);
  Assert.less(
    Math.abs(rect(tabAtEnd).right - rect(scrollbox).right),
    1,
    "Scrolling forward by one element brings the tab past the end into view"
  );

  await selectTab(tabs[0]);
  group.ungroupTabs();
});

add_task(async function test_collapsed_group_sticks() {
  let { tabs, third, groupedTabs, group } = groupMiddleThird("collapsed");
  let labelContainer = group.labelContainerElement;
  let selectedTab = groupedTabs[0];
  await BrowserTestUtils.allTabOpenAnimationsFinished(window);

  await selectTab(selectedTab);
  let collapseFinished = BrowserTestUtils.waitForEvent(
    window,
    "TabGroupCollapse"
  );
  group.collapsed = true;
  await collapseFinished;
  await TestUtils.waitForCondition(
    () => rect(groupedTabs[1]).width == 0,
    "Waiting for the group's other tabs to collapse"
  );

  let tabWidth = rect(tabs[2 * third]).width;
  await scrollTo(
    scrollPositionOf(selectedTab) + rect(selectedTab).width + 3 * tabWidth
  );
  assertAtStart(labelContainer, "Collapsed group's label");
  Assert.ok(selectedTab.hasAttribute("stuck"), "Selected tab is stuck");
  assertRightAfter(selectedTab, labelContainer, "Selected tab");

  await clickStuckTab(selectedTab);
  assertRightAfter(selectedTab, labelContainer, "Selected tab");
  Assert.greaterOrEqual(
    Math.round(rect(labelContainer).left),
    Math.round(rect(scrollbox).left),
    "Label is in view"
  );

  await selectTab(tabs[0]);
  group.collapsed = false;
  group.ungroupTabs();
});
