package com.unavora;

import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.junit.AnalyzeClasses;
import com.tngtech.archunit.junit.ArchTest;
import com.tngtech.archunit.lang.ArchRule;
import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

/** Module boundaries: other modules may use another module's `api` package only, never its `internal`. */
@AnalyzeClasses(packages = "com.unavora", importOptions = ImportOption.DoNotIncludeTests.class)
class ArchitectureTest {

    @ArchTest
    static final ArchRule propertiesInternalIsPrivateToProperties =
            noClasses().that().resideOutsideOfPackage("com.unavora.properties..")
                    .should().dependOnClassesThat().resideInAPackage("com.unavora.properties.internal..");

    @ArchTest
    static final ArchRule crmInternalIsPrivateToCrm =
            noClasses().that().resideOutsideOfPackage("com.unavora.crm..")
                    .should().dependOnClassesThat().resideInAPackage("com.unavora.crm.internal..");

    @ArchTest
    static final ArchRule customersInternalIsPrivateToCustomers =
            noClasses().that().resideOutsideOfPackage("com.unavora.customers..")
                    .should().dependOnClassesThat().resideInAPackage("com.unavora.customers.internal..");

    @ArchTest
    static final ArchRule crmMustNotReachPropertiesInternals =
            noClasses().that().resideInAPackage("com.unavora.crm..")
                    .should().dependOnClassesThat().resideInAPackage("com.unavora.properties.internal..");
}
