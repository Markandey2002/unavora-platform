package com.unavora;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.is;

import org.junit.jupiter.api.Test;

class PublicPropertyIT extends IntegrationTestBase {

    @Test
    void searchReturnsOnlyPublishedAvailableListings() throws Exception {
        mvc.perform(get("/api/v1/public/properties?lang=en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(4)))               // 4 published; draft and sold excluded
                .andExpect(content().string(not(containsString("Draft office"))))
                .andExpect(content().string(not(containsString("Sold 2 BHK"))));
    }

    @Test
    void publicResponsesNeverExposePrivateFields() throws Exception {
        mvc.perform(get("/api/v1/public/properties?lang=en"))
                .andExpect(content().string(not(containsString("addressLine"))))
                .andExpect(content().string(not(containsString("ownerUserId"))))
                .andExpect(content().string(not(containsString("address_line"))));
    }

    @Test
    void filtersApply() throws Exception {
        mvc.perform(get("/api/v1/public/properties?lang=en&city=Lucknow"))
                .andExpect(jsonPath("$.items", hasSize(2)));
        mvc.perform(get("/api/v1/public/properties?lang=en&type=plot"))
                .andExpect(jsonPath("$.items", hasSize(1)));
        mvc.perform(get("/api/v1/public/properties?lang=en&maxPrice=7000000"))
                .andExpect(jsonPath("$.items", hasSize(2)));
    }

    @Test
    void categoryFilterGroupsTypesAndListingsCarryStableCodes() throws Exception {
        // seed: 2 apartments + 1 villa (residential), 1 plot (land), no published commercial listing
        mvc.perform(get("/api/v1/public/properties?lang=en&category=residential"))
                .andExpect(jsonPath("$.items", hasSize(3)))
                .andExpect(jsonPath("$.items[*].category", everyItem(is("residential"))));
        mvc.perform(get("/api/v1/public/properties?lang=en&category=land"))
                .andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].typeCode").value("plot"));
        mvc.perform(get("/api/v1/public/properties?lang=en&category=commercial"))
                .andExpect(jsonPath("$.items", hasSize(0)));                    // the draft office stays hidden
        mvc.perform(get("/api/v1/public/properties?lang=hi&category=residential&city=Lucknow"))
                .andExpect(jsonPath("$.items", hasSize(2)));
        mvc.perform(get("/api/v1/public/properties?lang=en&category=farmhouse")).andExpect(status().isBadRequest());
    }

    @Test
    void locationsListOnlyPlacesWithPublicListings() throws Exception {
        mvc.perform(get("/api/v1/public/locations?lang=en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items", hasSize(3)))
                .andExpect(jsonPath("$.items[?(@.city=='Lucknow')].publishedCount", contains(2)))   // villa + 2 BHK; nothing draft/sold
                .andExpect(jsonPath("$.items[?(@.city=='Prayagraj')].publishedCount", contains(1))) // plot only; the sold flat is excluded
                .andExpect(content().string(not(containsString("ownerUserId"))));
        mvc.perform(get("/api/v1/public/locations?lang=hi"))
                .andExpect(jsonPath("$.items[?(@.city=='Lucknow')].locality", contains("गोमती नगर")));
        mvc.perform(get("/api/v1/public/locations?lang=fr")).andExpect(status().isBadRequest());
    }

    @Test
    void paginationWalksAllItemsWithoutRepeats() throws Exception {
        String page1 = mvc.perform(get("/api/v1/public/properties?lang=en&limit=2")).andExpect(jsonPath("$.items", hasSize(2)))
                .andReturn().getResponse().getContentAsString();
        String cursor = com.jayway.jsonpath.JsonPath.read(page1, "$.nextCursor");
        mvc.perform(get("/api/v1/public/properties?lang=en&limit=2&cursor=" + cursor))
                .andExpect(jsonPath("$.items", hasSize(2)))
                .andExpect(jsonPath("$.nextCursor").doesNotExist());
    }

    @Test
    void hindiListingIsServedInHindi() throws Exception {
        mvc.perform(get("/api/v1/public/properties?lang=hi"))
                .andExpect(jsonPath("$.items", hasSize(4)))
                .andExpect(jsonPath("$.items[0].language").value("hi"));
    }

    @Test
    void draftAndSoldDetailPagesAreNotFound() throws Exception {
        mvc.perform(get("/api/v1/public/properties/sample-draft-office-sector-37-noida?lang=en")).andExpect(status().isNotFound());
        mvc.perform(get("/api/v1/public/properties/sample-sold-2bhk-civil-lines-prayagraj?lang=en")).andExpect(status().isNotFound());
    }

    @Test
    void detailReturnsListingAndAmenities() throws Exception {
        mvc.perform(get("/api/v1/public/properties/sample-3bhk-apartment-sector-37-noida?lang=en"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.summary.city").value("Noida"))
                .andExpect(jsonPath("$.amenities", hasSize(3)));
    }

    @Test
    void invalidLanguageIsRejected() throws Exception {
        mvc.perform(get("/api/v1/public/properties?lang=fr")).andExpect(status().isBadRequest());
    }
}
